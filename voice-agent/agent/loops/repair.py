"""
REPAIR LOOP

Acts on a failed VerificationResult. Max 3 retries total per guest turn
(across STT/tool/TTS failures combined), then escalates -- per spec.

Repair strategies by failure type:
  - STT_FAILED        -> ask guest to repeat (no LLM call needed, cheapest)
  - TOOL_FAILED        -> retry the specific failed tool call(s) only
  - HALLUCINATION_RISK -> re-prompt the model, explicitly forcing it to call
                          a tool or say the "I'll check that for you po" line
  - TTS_FAILED         -> retry speech synthesis with the same text
  - EMPTY_RESPONSE      -> re-run planning once more

After max_retries is exhausted, returns an escalation message and a flag
the orchestrator uses to log to tala_conversations.escalated.
"""
from __future__ import annotations
from dataclasses import dataclass

from agent.config import load_settings
from agent.loops.verification import VerificationResult, FailureReason
from agent.tool_registry import execute_tool

_settings = load_settings()

ESCALATION_MESSAGE = (
    "I'm having a little trouble with that right now po. Let me get one of our "
    "team members to assist you directly -- they'll follow up shortly."
)

CLARIFICATION_MESSAGE = "Sorry po, I didn't catch that clearly. Could you say that again?"

FORCE_TOOL_NUDGE = (
    "Reminder: you must base your answer only on tool results or known guest memory. "
    "If you don't have the data, call the right tool now, or say exactly: "
    "\"I'll check that for you po.\""
)


@dataclass
class RepairOutcome:
    should_retry: bool
    escalate: bool
    message_override: str | None = None  # if set, use this instead of re-running anything
    nudge_for_replan: str | None = None   # if set, append this to conversation before replanning


def decide_repair(verification: VerificationResult, attempt_count: int) -> RepairOutcome:
    if attempt_count >= _settings.max_retries:
        return RepairOutcome(should_retry=False, escalate=True, message_override=ESCALATION_MESSAGE)

    if FailureReason.STT_FAILED in verification.reasons:
        return RepairOutcome(should_retry=True, escalate=False, message_override=CLARIFICATION_MESSAGE)

    if FailureReason.HALLUCINATION_RISK in verification.reasons:
        return RepairOutcome(should_retry=True, escalate=False, nudge_for_replan=FORCE_TOOL_NUDGE)

    if FailureReason.TOOL_FAILED in verification.reasons:
        return RepairOutcome(should_retry=True, escalate=False)

    if FailureReason.EMPTY_RESPONSE in verification.reasons:
        return RepairOutcome(should_retry=True, escalate=False)

    if FailureReason.TTS_FAILED in verification.reasons:
        return RepairOutcome(should_retry=True, escalate=False)

    return RepairOutcome(should_retry=False, escalate=False)


def retry_failed_tools(failed_tool_calls: list[tuple[str, dict]]) -> list:
    """Re-runs exactly the tools that failed last attempt, nothing else."""
    return [execute_tool(name, args) for name, args in failed_tool_calls]
