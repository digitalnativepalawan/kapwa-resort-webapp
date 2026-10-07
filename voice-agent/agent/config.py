"""TALA agent configuration loaded from environment variables."""
from __future__ import annotations

import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


def _require(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


@dataclass(frozen=True)
class Settings:
    # LiveKit
    livekit_url: str
    livekit_api_key: str
    livekit_api_secret: str

    # Providers
    deepgram_api_key: str
    openai_api_key: str
    openai_model: str
    elevenlabs_api_key: str
    elevenlabs_voice_id: str
    elevenlabs_model: str

    # KAPWA Backend / Neon PostgreSQL
    kapwa_api_url: str
    internal_fn_secret: str
    database_url: str

    # Resort context
    resort_name: str
    resort_timezone: str
    log_level: str


def load_settings() -> Settings:
    return Settings(
        livekit_url=_require("LIVEKIT_URL"),
        livekit_api_key=_require("LIVEKIT_API_KEY"),
        livekit_api_secret=_require("LIVEKIT_API_SECRET"),
        deepgram_api_key=_require("DEEPGRAM_API_KEY"),
        openai_api_key=_require("OPENAI_API_KEY"),
        openai_model=os.getenv("OPENAI_MODEL", "gpt-4o").strip(),
        elevenlabs_api_key=_require("ELEVENLABS_API_KEY"),
        elevenlabs_voice_id=_require("ELEVENLABS_VOICE_ID"),
        elevenlabs_model=os.getenv("ELEVENLABS_MODEL", "eleven_turbo_v2_5").strip(),
        kapwa_api_url=os.getenv("KAPWA_API_URL", "http://127.0.0.1:3000").strip(),
        internal_fn_secret=os.getenv("INTERNAL_FN_SECRET", "kapwa-internal-fn-secret-dev").strip(),
        database_url=os.getenv("DATABASE_URL", "").strip(),
        resort_name=os.getenv("RESORT_NAME", "BAIA Palawan").strip(),
        resort_timezone=os.getenv("RESORT_TIMEZONE", "Asia/Manila").strip(),
        log_level=os.getenv("LOG_LEVEL", "INFO").strip().upper(),
    )
