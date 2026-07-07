"""
LiveKit agent worker entrypoint -- rewired against the REAL LiveKit Agents
1.6.3 API (Agent / AgentSession / @function_tool), confirmed by direct
inspection of the installed package, not assumed from an older API surface.

Architecture:
  - TalaAgent(Agent) declares the 12 tools as @function_tool methods. Each
    method is a thin wrapper that calls the existing pure-Python tool
    functions in agent/tools/* -- so the Planner Loop (the framework's own
    LLM tool-calling) and the actual data access stay decoupled and testable.
  - AgentSession wires STT (whisper.cpp), LLM (Ollama, via OpenAI-compat
    base_url), TTS (Kokoro) -- all local, zero API cost.
  - The Planner Loop is the framework's native LLM tool-calling (Qwen3
    decides which @function_tool to call). We don't re-implement this.
  - The Execution Loop is the framework's native tool execution. We observe
    it via the "function_tools_executed" event to log + verify.
  - The Verification Loop runs on every "conversation_item_added" (checking
    for empty/blank assistant replies) and on every
    "function_tools_executed" (checking is_error on each output).
  - The Repair Loop reacts to verification failures: retries the failed
    tool call directly (bypassing the LLM, since we already know which
    tool+args failed), or nudges the agent to ask for clarification, up to
    MAX_RETRIES, then escalates by saying the escalation line and flagging
    tala_conversations.escalated = true.
"""
from __future__ import annotations
import json
import logging

from livekit.agents import (
    Agent,
    AgentSession,
    AutoSubscribe,
    JobContext,
    WorkerOptions,
    cli,
    function_tool,
    RunContext,
)
from livekit.plugins import openai as lk_openai

from agent.config import load_settings
from agent.memory.guest_memory import load_guest_memory, memory_to_prompt_block, upsert_guest_memory
from agent.persona import TALA_SYSTEM_PROMPT
from agent.tool_registry import TOOL_FUNCTIONS
from agent.supabase_client import get_client
from agent.loops.repair import ESCALATION_MESSAGE, CLARIFICATION_MESSAGE

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("tala-agent")

_settings = load_settings()


class TalaAgent(Agent):
    """
    TALA's tool surface. Each @function_tool method is intentionally a thin
    pass-through to agent/tools/* -- the actual Supabase queries / business
    logic live there so they stay unit-testable without spinning up LiveKit.
    """

    def __init__(self, memory_block: str) -> None:
        super().__init__(instructions=f"{TALA_SYSTEM_PROMPT}\n\n{memory_block}")

    @function_tool
    async def check_availability(self, context: RunContext, check_in: str, check_out: str, unit_type: str | None = None):
        """Check which resort units are available for a given date range (YYYY-MM-DD)."""
        return _to_tool_output(TOOL_FUNCTIONS["check_availability"](check_in=check_in, check_out=check_out, unit_type=unit_type))

    @function_tool
    async def today_arrivals(self, context: RunContext, target_date: str | None = None):
        """List guests arriving today, or on target_date if given (YYYY-MM-DD)."""
        return _to_tool_output(TOOL_FUNCTIONS["today_arrivals"](target_date=target_date))

    @function_tool
    async def today_departures(self, context: RunContext, target_date: str | None = None):
        """List guests departing today, or on target_date if given (YYYY-MM-DD)."""
        return _to_tool_output(TOOL_FUNCTIONS["today_departures"](target_date=target_date))

    @function_tool
    async def guest_notes(self, context: RunContext, unit_name: str | None = None, booking_id: str | None = None):
        """Read staff notes about a guest or unit."""
        return _to_tool_output(TOOL_FUNCTIONS["guest_notes"](unit_name=unit_name, booking_id=booking_id))

    @function_tool
    async def create_task(self, context: RunContext, title: str, description: str, priority: str = "medium"):
        """Create a follow-up task for staff for a non-urgent guest request."""
        return _to_tool_output(TOOL_FUNCTIONS["create_task"](title=title, description=description, priority=priority))

    @function_tool
    async def maintenance_request(self, context: RunContext, unit_name: str, issue: str, urgent: bool = False):
        """Report a maintenance or repair issue in a guest's unit."""
        return _to_tool_output(TOOL_FUNCTIONS["maintenance_request"](unit_name=unit_name, issue=issue, urgent=urgent))

    @function_tool
    async def housekeeping_status(self, context: RunContext, unit_name: str):
        """Check housekeeping/cleaning status for a unit."""
        return _to_tool_output(TOOL_FUNCTIONS["housekeeping_status"](unit_name=unit_name))

    @function_tool
    async def inventory_lookup(self, context: RunContext, item_name: str):
        """Check if an item or amenity is in stock before promising it to a guest."""
        return _to_tool_output(TOOL_FUNCTIONS["inventory_lookup"](item_name=item_name))

    @function_tool
    async def weather_lookup(self, context: RunContext):
        """Get current weather at the resort."""
        return _to_tool_output(TOOL_FUNCTIONS["weather_lookup"]())

    @function_tool
    async def find_travelers(self, context: RunContext, name_query: str | None = None, currently_staying_only: bool = True):
        """Look up currently-staying guests by name. Never reveal room numbers to a guest asking about another guest."""
        return _to_tool_output(TOOL_FUNCTIONS["find_travelers"](name_query=name_query, currently_staying_only=currently_staying_only))

    @function_tool
    async def find_events(self, context: RunContext, days_ahead: int = 3):
        """Find upcoming tours/activities at the resort."""
        return _to_tool_output(TOOL_FUNCTIONS["find_events"](days_ahead=days_ahead))

    @function_tool
    async def faq_lookup(self, context: RunContext, question: str):
        """Look up an answer to a general resort question from the curated FAQ. ALWAYS use this instead of answering resort facts from memory."""
        return _to_tool_output(TOOL_FUNCTIONS["faq_lookup"](question=question))


def _to_tool_output(result) -> str:
    """Normalizes a ToolResult into the string @function_tool methods should
    return -- LiveKit's LLM layer reads the return value as the tool output
    fed back to the model. Errors are surfaced as text so Qwen can react
    (e.g. apologize / say 'I'll check that for you po'), and are ALSO
    visible to our verification hook via FunctionCallOutput.is_error."""
    if not result.ok:
        raise RuntimeError(result.error or f"{result.tool_name} failed")
    if result.empty:
        return f"No results found for {result.tool_name}."
    return json.dumps(result.data, default=str)


class RepairState:
    """Per-session retry counter for the Repair Loop. Reset is not needed --
    each guest call is a fresh LiveKit room/session/process."""

    def __init__(self, max_retries: int) -> None:
        self.max_retries = max_retries
        self.attempts = 0
        self.tool_log: list[dict] = []
        self.escalated = False
        self.escalation_reason: str | None = None

    def record_tool_call(self, name: str, args: dict, ok: bool, error: str | None) -> None:
        self.tool_log.append({"tool": name, "args": args, "ok": ok, "error": error})

    def note_failure(self, reason: str) -> bool:
        """Returns True if a retry should be attempted, False if we should escalate."""
        self.attempts += 1
        if self.attempts > self.max_retries:
            self.escalated = True
            self.escalation_reason = reason
            return False
        return True


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    guest_name_hint = ctx.room.metadata or None
    memory = load_guest_memory(name=guest_name_hint)
    memory_block = memory_to_prompt_block(memory)
    repair = RepairState(max_retries=_settings.max_retries)

    # whisper.cpp and Kokoro both expose OpenAI-compatible HTTP APIs.
    # Ollama also exposes one at /v1, so the LLM step uses the same plugin
    # class pointed at a different base_url -- zero per-token cost, fully
    # self-hosted, no separate Ollama-specific plugin needed.
    stt = lk_openai.STT(base_url=f"{_settings.whisper_base_url}/v1", api_key="not-needed")
    llm = lk_openai.LLM(model=_settings.ollama_model, base_url=f"{_settings.ollama_base_url}/v1", api_key="not-needed")
    tts = lk_openai.TTS(base_url=f"{_settings.kokoro_base_url}/v1", voice=_settings.kokoro_voice, api_key="not-needed")

    session = AgentSession(stt=stt, llm=llm, tts=tts, max_tool_steps=4)

    # ── VERIFICATION LOOP: tool execution ───────────────────────────────
    @session.on("function_tools_executed")
    def _on_tools_executed(event):
        for call, output in zip(event.function_calls, event.function_call_outputs):
            args = _safe_json_loads(call.arguments)
            repair.record_tool_call(call.name, args, ok=not output.is_error, error=(output.output if output.is_error else None))

            if output.is_error:
                # ── REPAIR LOOP: tool failure -> retry the same tool directly ──
                should_retry = repair.note_failure(f"tool_failed:{call.name}")
                if should_retry:
                    retry_result = TOOL_FUNCTIONS[call.name](**args) if call.name in TOOL_FUNCTIONS else None
                    if retry_result is not None:
                        repair.record_tool_call(call.name, args, ok=retry_result.ok, error=retry_result.error)
                else:
                    session.say(ESCALATION_MESSAGE)

    # ── VERIFICATION LOOP: empty/blank assistant turns ──────────────────
    @session.on("conversation_item_added")
    def _on_item_added(event):
        item = event.item
        if getattr(item, "role", None) == "assistant" and getattr(item, "type", None) != "function_call":
            text = _extract_text(item)
            if not text or not text.strip():
                should_retry = repair.note_failure("empty_response")
                if should_retry:
                    session.say(CLARIFICATION_MESSAGE)
                else:
                    session.say(ESCALATION_MESSAGE)

    @session.on("error")
    def _on_error(event):
        logger.warning(f"Agent session error: {event}")
        should_retry = repair.note_failure("session_error")
        if not should_retry:
            session.say(ESCALATION_MESSAGE)

    @session.on("close")
    def _on_close(event):
        _persist_conversation(ctx.room.name, memory, session, repair)
        if memory or repair.tool_log:
            _maybe_update_memory(memory, guest_name_hint)

    agent = TalaAgent(memory_block=memory_block)
    await session.start(agent=agent, room=ctx.room)

    logger.info(f"TALA agent started in room {ctx.room.name}")


def _safe_json_loads(raw: str) -> dict:
    try:
        return json.loads(raw)
    except Exception:
        return {}


def _extract_text(item) -> str:
    content = getattr(item, "content", None)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return " ".join(str(c) for c in content)
    return str(content) if content else ""


def _persist_conversation(session_id: str, memory: dict | None, session: AgentSession, repair: RepairState) -> None:
    """Best-effort write to tala_conversations. Never raises -- a logging
    failure must not affect the call that already happened."""
    try:
        sb = get_client()
        transcript = [
            {"role": getattr(item, "role", "unknown"), "text": _extract_text(item)}
            for item in session.history.items
        ]
        sb.table("tala_conversations").upsert({
            "session_id": session_id,
            "guest_id": (memory or {}).get("guest_id"),
            "transcript": transcript,
            "tool_calls": repair.tool_log,
            "escalated": repair.escalated,
            "escalation_reason": repair.escalation_reason,
        }, on_conflict="session_id").execute()
    except Exception as e:
        logger.warning(f"Failed to persist conversation: {e}")


def _maybe_update_memory(memory: dict | None, guest_name_hint: str | None) -> None:
    """
    Minimal end-of-session memory write: bumps visit_count for a recognized
    guest. Richer fact extraction (dietary restrictions mentioned mid-call,
    etc.) is intentionally left as a follow-up -- doing it well needs a
    dedicated summarization pass over the transcript, which is more
    reliably done as a separate batch job than inline at session close.
    """
    try:
        guest_id = (memory or {}).get("guest_id")
        if guest_id or guest_name_hint:
            upsert_guest_memory(
                guest_id=guest_id,
                guest_name_fallback=guest_name_hint,
                visit_count=((memory or {}).get("visit_count") or 0) + 1,
            )
    except Exception as e:
        logger.warning(f"Failed to update guest memory: {e}")


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
