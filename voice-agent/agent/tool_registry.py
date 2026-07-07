"""
Tool registry. Maps tool name -> (callable, JSON schema for Qwen3 function-calling).

Qwen3 8B Instruct supports OpenAI-style tool-calling via Ollama's /api/chat
with "tools": [...]. This module is the single source of truth so the
Planner Loop and Execution Loop never drift out of sync with what's
actually callable.
"""
from __future__ import annotations
from typing import Any, Callable

from agent.tools.booking_tools import check_availability, today_arrivals, today_departures
from agent.tools.ops_tools import guest_notes, create_task, maintenance_request, housekeeping_status, inventory_lookup
from agent.tools.info_tools import weather_lookup, faq_lookup
from agent.tools.discovery_tools import find_travelers, find_events
from agent.tools.base import ToolResult

ToolFn = Callable[..., ToolResult]

TOOL_FUNCTIONS: dict[str, ToolFn] = {
    "check_availability": check_availability,
    "today_arrivals": today_arrivals,
    "today_departures": today_departures,
    "guest_notes": guest_notes,
    "create_task": create_task,
    "maintenance_request": maintenance_request,
    "housekeeping_status": housekeeping_status,
    "inventory_lookup": inventory_lookup,
    "weather_lookup": weather_lookup,
    "find_travelers": find_travelers,
    "find_events": find_events,
    "faq_lookup": faq_lookup,
}

# OpenAI-style tool schemas, passed to Ollama's chat endpoint.
TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "check_availability",
            "description": "Check which resort units are available for a given date range.",
            "parameters": {
                "type": "object",
                "properties": {
                    "check_in": {"type": "string", "description": "YYYY-MM-DD"},
                    "check_out": {"type": "string", "description": "YYYY-MM-DD"},
                    "unit_type": {"type": "string", "description": "Optional filter, e.g. 'seaside', 'mountainview'"},
                },
                "required": ["check_in", "check_out"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "today_arrivals",
            "description": "List guests arriving today (or a given date).",
            "parameters": {
                "type": "object",
                "properties": {"target_date": {"type": "string", "description": "YYYY-MM-DD, optional, defaults to today"}},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "today_departures",
            "description": "List guests departing today (or a given date).",
            "parameters": {
                "type": "object",
                "properties": {"target_date": {"type": "string", "description": "YYYY-MM-DD, optional, defaults to today"}},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "guest_notes",
            "description": "Read staff notes about a guest or unit.",
            "parameters": {
                "type": "object",
                "properties": {
                    "unit_name": {"type": "string"},
                    "booking_id": {"type": "string"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_task",
            "description": "Create a follow-up task for staff (non-urgent guest requests).",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "priority": {"type": "string", "enum": ["low", "medium", "high"]},
                },
                "required": ["title", "description"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "maintenance_request",
            "description": "Report a maintenance/repair issue in a guest's unit.",
            "parameters": {
                "type": "object",
                "properties": {
                    "unit_name": {"type": "string"},
                    "issue": {"type": "string"},
                    "urgent": {"type": "boolean"},
                },
                "required": ["unit_name", "issue"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "housekeeping_status",
            "description": "Check housekeeping/cleaning status for a unit.",
            "parameters": {
                "type": "object",
                "properties": {"unit_name": {"type": "string"}},
                "required": ["unit_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "inventory_lookup",
            "description": "Check if an item/amenity is in stock before promising it to a guest.",
            "parameters": {
                "type": "object",
                "properties": {"item_name": {"type": "string"}},
                "required": ["item_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "weather_lookup",
            "description": "Get current weather at the resort.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_travelers",
            "description": "Look up currently-staying guests by name (e.g. guest asking if their friend's group has arrived). Never reveal room numbers.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name_query": {"type": "string"},
                    "currently_staying_only": {"type": "boolean"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_events",
            "description": "Find upcoming tours/activities at the resort.",
            "parameters": {
                "type": "object",
                "properties": {"days_ahead": {"type": "integer"}},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "faq_lookup",
            "description": "Look up an answer to a general resort question (hours, wifi, policies, etc) from the curated FAQ. ALWAYS use this instead of answering resort facts from memory.",
            "parameters": {
                "type": "object",
                "properties": {"question": {"type": "string"}},
                "required": ["question"],
            },
        },
    },
]


def execute_tool(name: str, args: dict[str, Any]) -> ToolResult:
    fn = TOOL_FUNCTIONS.get(name)
    if fn is None:
        return ToolResult.failure(name, f"Unknown tool: {name}")
    try:
        return fn(**args)
    except TypeError as e:
        return ToolResult.failure(name, f"Bad arguments: {e}")
