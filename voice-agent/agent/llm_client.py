"""
Thin wrapper around Ollama's /api/chat endpoint with tool-calling support.
"""
from __future__ import annotations
from typing import Any
import httpx
from agent.config import load_settings

_settings = load_settings()


def chat(messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None = None, timeout: float | None = None) -> dict[str, Any]:
    """
    Calls Ollama /api/chat (non-streaming) and returns the raw response dict.
    Caller inspects response["message"] for content and/or tool_calls.
    """
    payload: dict[str, Any] = {
        "model": _settings.ollama_model,
        "messages": messages,
        "stream": False,
    }
    if tools:
        payload["tools"] = tools

    with httpx.Client(timeout=timeout or _settings.tool_timeout_seconds * 3) as client:
        resp = client.post(f"{_settings.ollama_base_url}/api/chat", json=payload)
        resp.raise_for_status()
        return resp.json()
