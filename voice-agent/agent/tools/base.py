"""
Every tool returns a ToolResult. This is what the Verification Loop inspects
to decide whether a retry is needed.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ToolResult:
    ok: bool
    tool_name: str
    data: Any = None
    error: str | None = None
    # Set by a tool when the result genuinely means "nothing found" rather
    # than "the call failed" — verification loop treats these differently.
    empty: bool = False
    meta: dict = field(default_factory=dict)

    @staticmethod
    def success(tool_name: str, data: Any, empty: bool = False, **meta) -> "ToolResult":
        return ToolResult(ok=True, tool_name=tool_name, data=data, empty=empty, meta=meta)

    @staticmethod
    def failure(tool_name: str, error: str, **meta) -> "ToolResult":
        return ToolResult(ok=False, tool_name=tool_name, error=error, meta=meta)
