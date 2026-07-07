"""
find_travelers: currently-staying guests (for "is my friend's group also here"
type questions — staff-mediated, never expose room numbers/full details to
a guest asking about ANOTHER guest; only confirm presence + first name).

find_events: tours/activities happening soon, from tours_config + tour_bookings.
"""
from __future__ import annotations
from datetime import datetime, timedelta
from agent.supabase_client import get_client
from agent.tools.base import ToolResult


def find_travelers(name_query: str | None = None, currently_staying_only: bool = True) -> ToolResult:
    """
    Looks up guests by partial name match. If currently_staying_only, restricts
    to guests with an active booking (check_in <= today <= check_out).
    Privacy note: only surfaces first name + unit type, never room number,
    phone, or payment info, when used in a guest-facing context.
    """
    try:
        sb = get_client()
        today = _manila_today()

        if currently_staying_only:
            bookings = (
                sb.table("resort_ops_bookings")
                .select("guest_id, resort_ops_guests(full_name), resort_ops_units(type)")
                .lte("check_in", today)
                .gte("check_out", today)
                .execute()
            )
            rows = bookings.data or []
            results = []
            for r in rows:
                guest = r.get("resort_ops_guests") or {}
                full_name = guest.get("full_name", "")
                if name_query and name_query.lower() not in full_name.lower():
                    continue
                results.append({
                    "first_name": full_name.split(" ")[0] if full_name else "Guest",
                    "unit_type": (r.get("resort_ops_units") or {}).get("type", "unknown"),
                })
            return ToolResult.success("find_travelers", results, empty=(len(results) == 0))
        else:
            q = sb.table("resort_ops_guests").select("full_name")
            if name_query:
                q = q.ilike("full_name", f"%{name_query}%")
            resp = q.limit(10).execute()
            rows = resp.data or []
            return ToolResult.success("find_travelers", rows, empty=(len(rows) == 0))
    except Exception as e:
        return ToolResult.failure("find_travelers", str(e))


def find_events(days_ahead: int = 3) -> ToolResult:
    """Upcoming tours/activities in the next `days_ahead` days, from tours_config + tour_bookings."""
    try:
        sb = get_client()
        today = _manila_today()
        end = (datetime.utcnow() + timedelta(days=days_ahead)).date().isoformat()

        tours = sb.table("tours_config").select("name, description, duration, price, max_pax, schedule").eq("active", True).execute()
        bookings = (
            sb.table("tour_bookings")
            .select("tour_name, tour_date, pax, status")
            .gte("tour_date", today)
            .lte("tour_date", end)
            .neq("status", "cancelled")
            .order("tour_date")
            .execute()
        )

        return ToolResult.success("find_events", {
            "available_tours": tours.data or [],
            "scheduled_in_range": bookings.data or [],
        }, empty=(not tours.data and not bookings.data))
    except Exception as e:
        return ToolResult.failure("find_events", str(e))


def _manila_today() -> str:
    return (datetime.utcnow() + timedelta(hours=8)).date().isoformat()
