"""
Staff/ops tools. These WRITE to live ops tables (resort_ops_tasks,
housekeeping_orders) -- treat as real actions, not stubs. They're scoped to
"create/read", never delete/update of existing staff records, by design.
"""
from __future__ import annotations
from datetime import datetime, timedelta
from agent.supabase_client import get_client
from agent.tools.base import ToolResult


def guest_notes(unit_name: str | None = None, booking_id: str | None = None, limit: int = 10) -> ToolResult:
    """Read staff notes for a guest/unit. Read-only -- guest_notes are staff-authored."""
    try:
        sb = get_client()
        q = sb.table("guest_notes").select("content, note_type, created_by, created_at, unit_name").order("created_at", desc=True).limit(limit)
        if unit_name:
            q = q.eq("unit_name", unit_name)
        if booking_id:
            q = q.eq("booking_id", booking_id)
        resp = q.execute()
        rows = resp.data or []
        return ToolResult.success("guest_notes", rows, empty=(len(rows) == 0))
    except Exception as e:
        return ToolResult.failure("guest_notes", str(e))


def create_task(title: str, description: str, priority: str = "medium", category: str = "concierge-ai", due_in_hours: int = 4) -> ToolResult:
    """
    General staff task. priority: low|medium|high.
    Used for non-urgent guest requests that need a human follow-up
    (e.g. "can someone bring extra towels", "book me a table tonight").
    """
    try:
        sb = get_client()
        due = (datetime.utcnow() + timedelta(hours=due_in_hours)).date().isoformat()
        resp = sb.table("resort_ops_tasks").insert({
            "title": title,
            "description": description,
            "category": category,
            "priority": priority,
            "due_date": due,
            "status": "pending",
        }).execute()
        return ToolResult.success("create_task", resp.data)
    except Exception as e:
        return ToolResult.failure("create_task", str(e))


def maintenance_request(unit_name: str, issue: str, urgent: bool = False) -> ToolResult:
    """
    Maintenance/repair issue. Routes through resort_ops_tasks with category
    'maintenance' and high priority if urgent -- kept distinct from create_task
    so staff dashboards can filter on category cleanly.
    """
    try:
        sb = get_client()
        due = (datetime.utcnow() + timedelta(hours=1 if urgent else 6)).date().isoformat()
        resp = sb.table("resort_ops_tasks").insert({
            "title": f"Maintenance: {unit_name}",
            "description": issue,
            "category": "maintenance",
            "priority": "high" if urgent else "medium",
            "due_date": due,
            "status": "pending",
        }).execute()
        return ToolResult.success("maintenance_request", resp.data, meta={"urgent": urgent})
    except Exception as e:
        return ToolResult.failure("maintenance_request", str(e))


def housekeeping_status(unit_name: str) -> ToolResult:
    """Latest housekeeping_orders row for a unit -- for 'is my room cleaned yet' type questions."""
    try:
        sb = get_client()
        resp = (
            sb.table("housekeeping_orders")
            .select("status, priority, cleaning_completed_at, inspection_completed_at, created_at")
            .eq("unit_name", unit_name)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        if not rows:
            return ToolResult.success("housekeeping_status", None, empty=True)
        return ToolResult.success("housekeeping_status", rows[0])
    except Exception as e:
        return ToolResult.failure("housekeeping_status", str(e))


def inventory_lookup(item_name: str) -> ToolResult:
    """
    Checks the `assets` table (current_quantity / min_quantity tracked stock)
    for a name match. TALA uses this to answer "do we have X" before
    promising a guest an amenity/item.
    """
    try:
        sb = get_client()
        resp = (
            sb.table("assets")
            .select("name, current_quantity, min_quantity, unit, department")
            .ilike("name", f"%{item_name}%")
            .limit(5)
            .execute()
        )
        rows = resp.data or []
        out = [
            {
                "name": r["name"],
                "in_stock": r["current_quantity"] > 0,
                "quantity": r["current_quantity"],
                "low_stock": r["current_quantity"] <= r["min_quantity"],
                "unit": r.get("unit"),
            }
            for r in rows
        ]
        return ToolResult.success("inventory_lookup", out, empty=(len(out) == 0))
    except Exception as e:
        return ToolResult.failure("inventory_lookup", str(e))
