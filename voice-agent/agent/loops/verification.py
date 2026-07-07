"""
VERIFICATION LOOP

After execution produces a candidate response, check the things this build
spec explicitly requires:
  - Was every guest question answered? (no empty/blank final response)
  - Was each tool call successful?
  - Did speech transcription fail upstream? (passed in from the STT stage)
  - Did TTS generate audio? (checked AFTER synthesis, separately -- see
    voice_io.verify_tts_output)
  - Is anything obviously missing (e.g. model said "I don't know" without
    having called a tool first)?

This loop does NOT fix anything -- it only classifies. The Repair Loop acts
on what comes out of here.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum

from agent.tools.base import ToolResult


class FailureReason(str, Enum):
    EMPTY_RESPONSE = "empty_response"
    TOOL_FAILED = "tool_failed"
    STT_FAILED = "stt_failed"
    TTS_FAILED = "tts_failed"
    HALLUCINATION_RISK = "hallucination_risk"  # model answered substantively with zero tool calls on a factual question
    NONE = "none"


@dataclass
class VerificationResult:
    passed: bool
    reasons: list[FailureReason] = field(default_factory=list)
    failed_tools: list[str] = field(default_factory=list)
    detail: str = ""


# Phrases that signal the model is bluffing rather than grounding in a tool result.
_HALLUCINATION_MARKERS = (
    "typically", "usually", "i believe", "i think", "generally", "as far as i know",
)


def verify_execution(
    final_response: str,
    tool_results: list[ToolResult],
    stt_failed: bool = False,
    asked_factual_question: bool = False,
) -> VerificationResult:
    reasons: list[FailureReason] = []
    failed_tools: list[str] = []

    if stt_failed:
        reasons.append(FailureReason.STT_FAILED)

    if not final_response or not final_response.strip():
        reasons.append(FailureReason.EMPTY_RESPONSE)

    for tr in tool_results:
        if not tr.ok:
            reasons.append(FailureReason.TOOL_FAILED)
            failed_tools.append(tr.tool_name)

    if asked_factual_question and not tool_results:
        lowered = final_response.lower()
        if any(marker in lowered for marker in _HALLUCINATION_MARKERS):
            reasons.append(FailureReason.HALLUCINATION_RISK)

    passed = len(reasons) == 0
    return VerificationResult(
        passed=passed,
        reasons=reasons or [FailureReason.NONE],
        failed_tools=failed_tools,
        detail="; ".join(r.value for r in reasons) if reasons else "ok",
    )


def verify_tts_output(audio_bytes: bytes | None) -> VerificationResult:
    if not audio_bytes or len(audio_bytes) < 100:
        return VerificationResult(passed=False, reasons=[FailureReason.TTS_FAILED], detail="no/short audio output")
    return VerificationResult(passed=True, reasons=[FailureReason.NONE])
