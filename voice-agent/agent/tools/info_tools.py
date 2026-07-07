"""
weather_lookup: live call to OpenWeatherMap (free tier).
faq_lookup: queries faq_entries table — TALA must NEVER answer general resort
facts from its own "knowledge", only from this table or other tool results.
"""
from __future__ import annotations
import httpx
from agent.config import load_settings
from agent.supabase_client import get_client
from agent.tools.base import ToolResult

_settings = load_settings()


def weather_lookup() -> ToolResult:
    """Current weather + simple forecast for San Vicente, Palawan (resort coords)."""
    if not _settings.weather_api_key:
        return ToolResult.failure("weather_lookup", "WEATHER_API_KEY not configured")
    try:
        url = "https://api.openweathermap.org/data/2.5/weather"
        params = {
            "lat": _settings.resort_lat,
            "lon": _settings.resort_lon,
            "appid": _settings.weather_api_key,
            "units": "metric",
        }
        with httpx.Client(timeout=_settings.tool_timeout_seconds) as client:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
        out = {
            "condition": data["weather"][0]["description"],
            "temp_c": round(data["main"]["temp"]),
            "feels_like_c": round(data["main"]["feels_like"]),
            "rain_chance": data.get("rain", {}).get("1h") is not None,
            "wind_kph": round(data["wind"]["speed"] * 3.6),
        }
        return ToolResult.success("weather_lookup", out)
    except Exception as e:
        return ToolResult.failure("weather_lookup", str(e))


def faq_lookup(question: str) -> ToolResult:
    """
    Keyword-matches the guest's question against faq_entries.keywords / question.
    Returns the best match, or empty if nothing matches closely — agent must
    say "I'll check that for you po." rather than guessing in that case.
    """
    try:
        sb = get_client()
        resp = sb.table("faq_entries").select("question, answer, category, keywords").eq("active", True).execute()
        rows = resp.data or []

        q_lower = question.lower()
        scored = []
        for r in rows:
            score = 0
            for kw in (r.get("keywords") or []):
                if kw.lower() in q_lower:
                    score += 2
            # crude word-overlap fallback
            q_words = set(q_lower.split())
            faq_words = set(r["question"].lower().split())
            score += len(q_words & faq_words)
            if score > 0:
                scored.append((score, r))

        if not scored:
            return ToolResult.success("faq_lookup", None, empty=True)

        scored.sort(key=lambda x: x[0], reverse=True)
        best = scored[0][1]
        return ToolResult.success("faq_lookup", {"answer": best["answer"], "category": best["category"]})
    except Exception as e:
        return ToolResult.failure("faq_lookup", str(e))
