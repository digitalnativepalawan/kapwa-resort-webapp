/**
 * Calls the local token server (agent/token_server.py) to get a LiveKit
 * access token before joining a room. Token server URL is configurable via
 * VITE_TOKEN_SERVER_URL so this works the same in Docker (service name) and
 * local dev (localhost).
 */

export interface TokenResponse {
  token: string;
  room_name: string;
  livekit_url: string;
}

const TOKEN_SERVER_URL =
  import.meta.env.VITE_TOKEN_SERVER_URL ?? "http://localhost:3001";

export async function fetchToken(guestName?: string): Promise<TokenResponse> {
  const res = await fetch(`${TOKEN_SERVER_URL}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ guest_name: guestName ?? null }),
  });

  if (!res.ok) {
    throw new Error(`Token server error: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as TokenResponse;
}
