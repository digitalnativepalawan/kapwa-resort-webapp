"""
ORCHESTRATOR -- runs one guest turn through all four loops:
  Planner -> Execution -> Verification -> Repair (if needed, up to max_retries)

This is called by the LiveKit agent worker once per finalized guest utterance
(after STT produces text). It does NOT handle audio I/O -- see livekit_agent.py.
"""
from __future__ import annotations
from dataclasses import dataclass, field

from agent.config import load_settings
from agent.loops.planner import make_plan, Plan
from agent.loops.execution import run_execution, ExecutionOutcome
from agent.loops.verification import verify_execution, VerificationResult, FailureReason
from agent.loops.repair import decide_repair, retry_failed_tools, ESCALATION_MESSAGE

_settings = load_settings()


@dataclass
class TurnResult:
    response_text: str
    tool_calls_log: list[dict] = field(default_factory=list)
    escalated: bool = False
    escalation_reason: str | None = None
    retries_used: int = 0


def run_turn(
    conversation: list[dict[str, str]],
    memory_block: str,
    stt_failed: bool = False,
    asked_factual_question: bool = True,
) -> TurnResult:
    """
    conversation already includes the latest guest utterance as the final
    {"role": "user", ...} entry. Returns the text TALA should speak.
    """
    tool_log: list[dict] = []
    attempt = 0

    if stt_failed:
        # No point planning against garbled/empty text -- go straight to repair.
        verification = VerificationResult(passed=False, reasons=[FailureReason.STT_FAILED])
        repair = decide_repair(verification, attempt)
        return TurnResult(response_text=repair.message_override or ESCALATION_MESSAGE, retries_used=1)

    while True:
        plan: Plan = make_plan(conversation, memory_block)
        outcome: ExecutionOutcome = run_execution(plan, conversation, memory_block)

        for call, result in zip(plan.tool_calls, outcome.tool_results):
            tool_log.append({
                "tool": call.name,
                "args": call.args,
                "ok": result.ok,
                "empty": result.empty,
                "error": result.error,
            })

        verification = verify_execution(
            final_response=outcome.final_response,
            tool_results=outcome.tool_results,
            stt_failed=False,
            asked_factual_question=asked_factual_question,
        )

        if verification.passed:
            return TurnResult(response_text=outcome.final_response, tool_calls_log=tool_log, retries_used=attempt)

        repair = decide_repair(verification, attempt)
        attempt += 1

        if repair.escalate:
            return TurnResult(
                response_text=repair.message_override or ESCALATION_MESSAGE,
                tool_calls_log=tool_log,
                escalated=True,
                escalation_reason=verification.detail,
                retries_used=attempt,
            )

        if repair.message_override:
            # e.g. STT clarification -- nothing to retry, just speak this and stop.
            return TurnResult(response_text=repair.message_override, tool_calls_log=tool_log, retries_used=attempt)

        if FailureReason.TOOL_FAILED in verification.reasons:
            failed_calls = [
                (call.name, call.args)
                for call, result in zip(plan.tool_calls, outcome.tool_results)
                if not result.ok
            ]
            retry_results = retry_failed_tools(failed_calls)
            for (name, args), result in zip(failed_calls, retry_results):
                tool_log.append({"tool": name, "args": args, "ok": result.ok, "retry": True, "error": result.error})
            if all(r.ok for r in retry_results):
                # Treat the retried data as good enough; let the next loop
                # iteration re-plan with fresh context (simplest correct path
                # given an 8B local model -- avoids hand-stitching partial state).
                continue

        if repair.nudge_for_replan:
            conversation = conversation + [{"role": "system", "content": repair.nudge_for_replan}]

        # Loop back to re-plan, up to max_retries (enforced by decide_repair).
