"""
PLANNER LOOP

Takes the guest's transcribed utterance + conversation history, and asks
Qwen (with tool schemas attached) what it wants to do: answer directly, or
call one or more tools first. We don't hand-roll intent classification --
Qwen3's native tool-calling IS the planner. This module just packages the
call and normalizes the result into a Plan object the Execution Loop consumes.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any

from agent.llm_client import chat
from agent.tool_registry import TOOL_SCHEMAS
from agent.persona import TALA_SYSTEM_PROMPT


@dataclass
class PlannedToolCall:
    name: str
    args: dict[str, Any]
    raw_id: str | None = None


@dataclass
class Plan:
    # If the model answered directly with no tool calls, direct_response is set
    # and tool_calls is empty -- Execution Loop just passes it through.
    direct_response: str | None = None
    tool_calls: list[PlannedToolCall] = field(default_factory=list)
    raw_assistant_message: dict[str, Any] | None = None


def make_plan(conversation: list[dict[str, str]], memory_block: str) -> Plan:
    """
    conversation: list of {"role": "user"|"assistant", "content": str} -- the
    running transcript for this session, WITHOUT the system prompt (added here).
    memory_block: pre-formatted guest memory text (see memory.guest_memory).
    """
    system = {"role": "system", "content": f"{TALA_SYSTEM_PROMPT}\n\n{memory_block}"}
    messages = [system] + conversation

    response = chat(messages, tools=TOOL_SCHEMAS)
    msg = response.get("message", {})

    tool_calls_raw = msg.get("tool_calls") or []
    if not tool_calls_raw:
        return Plan(direct_response=msg.get("content", "").strip(), raw_assistant_message=msg)

    planned = [
        PlannedToolCall(
            name=tc["function"]["name"],
            args=tc["function"].get("arguments", {}) or {},
            raw_id=tc.get("id"),
        )
        for tc in tool_calls_raw
    ]
    return Plan(tool_calls=planned, raw_assistant_message=msg)
