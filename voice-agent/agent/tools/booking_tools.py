"""
Booking-related tools, querying resort_ops_bookings / resort_ops_units / resort_ops_guests.
"""
from __future__ import annotations
from datetime import date, datetime, timedelta
from agent.supabase_client import get_client
from agent.tools.base import ToolResult


def check_availability(check_in: str, check_out: str, unit_type: str | None = None) -> ToolResult:
    """
    check_in / check_out: 'YYYY-MM-DD' strings.
    Returns units NOT booked (no overlapping resort_ops_bookings row) for that range.
    """
    try:
        sb = get_client()

        units_q = sb.table("resort_ops_units").select("id, name, type, base_price, capacity")
        if unit_type:
            units_q = units_q.ilike("type", f"%{unit_type}%")
        units_resp = units_q.execute()
        all_units = units_resp.data or []

        if not all_units:
            return ToolResult.success("check_availability", [], empty=True)

        # overlapping bookings: existing.check_in < requested.check_out AND existing.check_out > requested.check_in
        bookings_resp = (
            sb.table("resort_ops_bookings")
            .select("unit_id, check_in, check_out")
            .lt("check_in", check_out)
            .gt("check_out", check_in)
            .execute()
        )
        booked_unit_ids = {b["unit_id"] for b in (bookings_resp.data or []) if b.get("unit_id")}

        available = [u for u in all_units if u["id"] not in booked_unit_ids]
        return ToolResult.success(
            "check_availability",
            [{"name": u["name"], "type": u["type"], "rate": u["base_price"], "capacity": u["capacity"]} for u in available],
            empty=(len(available) == 0),
        )
    except Exception as e:
        return ToolResult.failure("check_availability", str(e))


def today_arrivals(target_date: str | None = None) -> ToolResult:
    """Bookings with check_in == target_date (default: today, Manila time)."""
    try:
        sb = get_client()
        d = target_date or _manila_today()
        resp = (
            sb.table("resort_ops_bookings")
            .select("id, check_in, check_out, adults, children, guest_id, unit_id, special_requests, checked_in_at, resort_ops_guests(full_name, phone), resort_ops_units(name)")
            .eq("check_in", d)
            .execute()
        )
        rows = resp.data or []
        out = [
            {
                "guest_name": (r.get("resort_ops_guests") or {}).get("full_name", "Unknown"),
                "unit": (r.get("resort_ops_units") or {}).get("name", "Unassigned"),
                "adults": r["adults"],
                "children": r["children"],
                "checked_in": r["checked_in_at"] is not None,
                "special_requests": r.get("special_requests") or None,
            }
            for r in rows
        ]
        return ToolResult.success("today_arrivals", out, empty=(len(out) == 0))
    except Exception as e:
        return ToolResult.failure("today_arrivals", str(e))


def today_departures(target_date: str | None = None) -> ToolResult:
    """Bookings with check_out == target_date (default: today, Manila time)."""
    try:
        sb = get_client()
        d = target_date or _manila_today()
        resp = (
            sb.table("resort_ops_bookings")
            .select("id, check_out, guest_id, unit_id, checked_out_at, payment_status, resort_ops_guests(full_name), resort_ops_units(name)")
            .eq("check_out", d)
            .execute()
        )
        rows = resp.data or []
        out = [
            {
                "guest_name": (r.get("resort_ops_guests") or {}).get("full_name", "Unknown"),
                "unit": (r.get("resort_ops_units") or {}).get("name", "Unassigned"),
                "checked_out": r["checked_out_at"] is not None,
                "payment_status": r.get("payment_status") or "unknown",
            }
            for r in rows
        ]
        return ToolResult.success("today_departures", out, empty=(len(out) == 0))
    except Exception as e:
        return ToolResult.failure("today_departures", str(e))


def _manila_today() -> str:
    return (datetime.utcnow() + timedelta(hours=8)).date().isoformat()
