"""
EXECUTION LOOP

Given a Plan (from the Planner Loop) with one or more tool calls, runs them
(sequentially -- KAPWA OS's Supabase free tier + a 8B local model don't need
concurrency complexity here), collects ToolResults, then makes a SECOND
call to Qwen with the tool results appended so it can generate the final
spoken response grounded in real data.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any

from agent.tool_registry import execute_tool
from agent.tools.base import ToolResult
from agent.llm_client import chat
from agent.tool_registry import TOOL_SCHEMAS
from agent.persona import TALA_SYSTEM_PROMPT
from agent.loops.planner import Plan


@dataclass
class ExecutionOutcome:
    final_response: str
    tool_results: list[ToolResult] = field(default_factory=list)
    updated_conversation: list[dict[str, Any]] = field(default_factory=list)


def run_execution(plan: Plan, conversation: list[dict[str, str]], memory_block: str) -> ExecutionOutcome:
    if not plan.tool_calls:
        # No tools needed -- planner already produced the final response.
        return ExecutionOutcome(final_response=plan.direct_response or "", tool_results=[])

    results: list[ToolResult] = []
    for call in plan.tool_calls:
        result = execute_tool(call.name, call.args)
        results.append(result)

    # Build the follow-up messages: assistant's tool-call message, then a
    # tool-result message per call, per Ollama's expected tool-calling format.
    system = {"role": "system", "content": f"{TALA_SYSTEM_PROMPT}\n\n{memory_block}"}
    messages = [system] + conversation + [plan.raw_assistant_message]

    for call, result in zip(plan.tool_calls, results):
        content = _stringify_result(result)
        messages.append({"role": "tool", "content": content})

    response = chat(messages, tools=TOOL_SCHEMAS)
    final_text = response.get("message", {}).get("content", "").strip()

    return ExecutionOutcome(final_response=final_text, tool_results=results, updated_conversation=messages)


def _stringify_result(result: ToolResult) -> str:
    if not result.ok:
        return f"ERROR calling {result.tool_name}: {result.error}"
    if result.empty:
        return f"{result.tool_name} returned no results."
    return f"{result.tool_name} result: {result.data}"
