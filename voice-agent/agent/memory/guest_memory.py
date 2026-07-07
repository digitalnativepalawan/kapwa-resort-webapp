"""
Guest memory: injected into the persona prompt at the START of a session
(read), and merged/updated at the END of a session (write).

This is deliberately NOT a tool the LLM calls mid-conversation -- memory
load is automatic context, not something TALA "decides" to fetch, so it
can't forget to check it.
"""
from __future__ import annotations
from datetime import datetime
from typing import Any
from agent.supabase_client import get_client


def load_guest_memory(guest_id: str | None = None, phone: str | None = None, name: str | None = None) -> dict[str, Any] | None:
    """
    Best-effort identity match: guest_id (exact) > phone > name.
    Returns None if nothing found -- caller treats this guest as new.
    """
    sb = get_client()
    try:
        if guest_id:
            resp = sb.table("guest_memory").select("*").eq("guest_id", guest_id).limit(1).execute()
            if resp.data:
                return resp.data[0]
        if phone:
            resp = sb.table("guest_memory").select("*").eq("phone_fallback", phone).limit(1).execute()
            if resp.data:
                return resp.data[0]
        if name:
            resp = sb.table("guest_memory").select("*").ilike("guest_name_fallback", f"%{name}%").limit(1).execute()
            if resp.data:
                return resp.data[0]
    except Exception:
        # Memory is an enhancement, not a hard dependency -- never block a
        # conversation from starting because memory lookup failed.
        return None
    return None


def memory_to_prompt_block(memory: dict[str, Any] | None) -> str:
    """Formats guest memory as a short block to append to the system prompt."""
    if not memory:
        return "This appears to be a new or unrecognized guest -- no memory on file."

    lines = []
    if memory.get("preferred_name"):
        lines.append(f"Preferred name: {memory['preferred_name']}")
    if memory.get("dietary_restrictions"):
        lines.append(f"Dietary restrictions: {', '.join(memory['dietary_restrictions'])}")
    if memory.get("allergies"):
        lines.append(f"Allergies: {', '.join(memory['allergies'])}")
    if memory.get("birthday"):
        lines.append(f"Birthday: {memory['birthday']}")
    if memory.get("favorite_activities"):
        lines.append(f"Likes: {', '.join(memory['favorite_activities'])}")
    if memory.get("favorite_foods"):
        lines.append(f"Favorite foods: {', '.join(memory['favorite_foods'])}")
    if memory.get("visit_count"):
        lines.append(f"Visit count: {memory['visit_count']} (returning guest)")
    if memory.get("notes"):
        lines.append(f"Notes: {memory['notes']}")

    if not lines:
        return "Guest is recognized but has no stored preferences yet."
    return "Guest memory:\n" + "\n".join(f"- {l}" for l in lines)


def upsert_guest_memory(
    guest_id: str | None,
    guest_name_fallback: str | None = None,
    phone_fallback: str | None = None,
    **fields: Any,
) -> bool:
    """
    Merge new info into existing memory row, or create one. Called at end of
    session by the orchestrator with whatever new facts surfaced in
    conversation. Returns True on success -- failure here should never
    crash the call, just log.
    """
    sb = get_client()
    try:
        existing = load_guest_memory(guest_id=guest_id, phone=phone_fallback, name=guest_name_fallback)
        payload = {k: v for k, v in fields.items() if v is not None}
        payload["updated_at"] = datetime.utcnow().isoformat()

        if existing:
            # Merge array fields rather than overwrite, so repeated mentions accumulate.
            for arr_field in ("dietary_restrictions", "allergies", "favorite_activities", "favorite_foods"):
                if arr_field in payload:
                    merged = list(set((existing.get(arr_field) or []) + payload[arr_field]))
                    payload[arr_field] = merged
            sb.table("guest_memory").update(payload).eq("id", existing["id"]).execute()
        else:
            payload["guest_id"] = guest_id
            payload["guest_name_fallback"] = guest_name_fallback
            payload["phone_fallback"] = phone_fallback
            payload.setdefault("visit_count", 1)
            sb.table("guest_memory").insert(payload).execute()
        return True
    except Exception:
        return False
