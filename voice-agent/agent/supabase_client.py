"""
Thin Supabase client wrapper. Uses the service role key — this code runs
server-side only (inside the LiveKit agent worker), never shipped to the browser.
"""
from __future__ import annotations
from supabase import create_client, Client
from agent.config import load_settings

_settings = load_settings()
_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(_settings.supabase_url, _settings.supabase_service_role_key)
    return _client
