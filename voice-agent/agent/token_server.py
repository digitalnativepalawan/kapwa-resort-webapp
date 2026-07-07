"""
Minimal token server: the React frontend hits POST /token to get a LiveKit
access token + room name before joining a voice session. Kept separate from
the LiveKit agent worker process (agent worker runs persistently and waits
for rooms; this is a lightweight per-request HTTP service).

Run with: uvicorn agent.token_server:app --host 0.0.0.0 --port 3001
"""
from __future__ import annotations
import uuid
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from livekit import api as lk_api

from agent.config import load_settings

_settings = load_settings()

app = FastAPI(title="TALA token server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to the deployed frontend origin in production
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["*"],
)


class TokenRequest(BaseModel):
    guest_name: str | None = None
    room_name: str | None = None  # optional: rejoin an existing session


class TokenResponse(BaseModel):
    token: str
    room_name: str
    livekit_url: str


@app.post("/token", response_model=TokenResponse)
def create_token(body: TokenRequest) -> TokenResponse:
    room_name = body.room_name or f"tala-{uuid.uuid4().hex[:8]}"
    identity = body.guest_name or f"guest-{uuid.uuid4().hex[:6]}"

    token = lk_api.AccessToken(_settings.livekit_api_key, _settings.livekit_api_secret)
    token.with_identity(identity).with_name(identity).with_grants(
        lk_api.VideoGrants(room_join=True, room=room_name)
    )
    # Carry the guest's stated name into room metadata so the agent worker
    # can use it for memory lookup (see livekit_agent.py entrypoint).
    token.with_metadata(body.guest_name or "")

    return TokenResponse(token=token.to_jwt(), room_name=room_name, livekit_url=_settings.livekit_url)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
