"""
Central config for the TALA voice agent.
All values come from environment variables — see .env.example.
"""
from __future__ import annotations
import os
from dataclasses import dataclass


def _env(key: str, default: str | None = None, required: bool = False) -> str:
    val = os.environ.get(key, default)
    if required and not val:
        raise RuntimeError(f"Missing required env var: {key}")
    return val or ""


@dataclass(frozen=True)
class Settings:
    # LiveKit
    livekit_url: str
    livekit_api_key: str
    livekit_api_secret: str

    # Ollama (LLM)
    ollama_base_url: str
    ollama_model: str

    # Whisper STT (whisper.cpp server, OpenAI-compatible HTTP API)
    whisper_base_url: str

    # Kokoro TTS (Kokoro-FastAPI, OpenAI-compatible HTTP API)
    kokoro_base_url: str
    kokoro_voice: str

    # Supabase
    supabase_url: str
    supabase_service_role_key: str

    # Weather
    weather_api_key: str  # OpenWeatherMap free tier key; San Vicente, Palawan coords hardcoded in tool
    resort_lat: float
    resort_lon: float

    # Loop tuning
    max_retries: int
    tool_timeout_seconds: float


def load_settings() -> Settings:
    return Settings(
        livekit_url=_env("LIVEKIT_URL", "ws://localhost:7880"),
        livekit_api_key=_env("LIVEKIT_API_KEY", required=True),
        livekit_api_secret=_env("LIVEKIT_API_SECRET", required=True),

        ollama_base_url=_env("OLLAMA_BASE_URL", "http://localhost:11434"),
        ollama_model=_env("OLLAMA_MODEL", "qwen3:8b"),

        whisper_base_url=_env("WHISPER_BASE_URL", "http://localhost:9000"),

        kokoro_base_url=_env("KOKORO_BASE_URL", "http://localhost:8880"),
        kokoro_voice=_env("KOKORO_VOICE", "af_bella"),

        supabase_url=_env("SUPABASE_URL", required=True),
        supabase_service_role_key=_env("SUPABASE_SERVICE_ROLE_KEY", required=True),

        weather_api_key=_env("WEATHER_API_KEY", ""),
        resort_lat=float(_env("RESORT_LAT", "10.5333")),   # San Vicente, Palawan
        resort_lon=float(_env("RESORT_LON", "119.2500")),

        max_retries=int(_env("MAX_RETRIES", "3")),
        tool_timeout_seconds=float(_env("TOOL_TIMEOUT_SECONDS", "8.0")),
    )
