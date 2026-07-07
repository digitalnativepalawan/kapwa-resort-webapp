/**
 * Core voice-session hook. Manages:
 *   - LiveKit room connection lifecycle
 *   - Mic publish/unpublish (tap to talk)
 *   - Connection/agent-state for UI feedback
 *
 * Repair-loop awareness on the frontend is limited to what the GUEST needs
 * to see: connection drops, mic permission issues. The Planner/Execution/
 * Verification/Repair loops themselves run entirely server-side in the
 * LiveKit agent worker (see agent/orchestrator.py) -- this hook has no
 * business re-implementing retry logic for tool calls it can't see.
 */
import { useCallback, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  LocalParticipant,
  RemoteTrack,
  Track,
  createLocalAudioTrack,
} from "livekit-client";
import { fetchToken } from "../lib/tokenClient";

export type SessionState =
  | "idle"
  | "connecting"
  | "connected"
  | "listening"
  | "speaking"
  | "error";

export function useTalaVoice() {
  const [state, setState] = useState<SessionState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const roomRef = useRef<Room | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const connect = useCallback(async (guestName?: string) => {
    setState("connecting");
    setErrorMessage(null);
    try {
      const { token, livekit_url } = await fetchToken(guestName);
      const room = new Room();
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach() as HTMLAudioElement;
          audioElRef.current = el;
          document.body.appendChild(el);
          setState("speaking");
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        setState("idle");
      });

      await room.connect(livekit_url, token);
      setState("connected");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Connection failed");
      setState("error");
    }
  }, []);

  const startTalking = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      const localParticipant: LocalParticipant = room.localParticipant;
      const micTrack = await createLocalAudioTrack();
      await localParticipant.publishTrack(micTrack);
      setState("listening");
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? `Microphone error: ${err.message}`
          : "Could not access microphone"
      );
      setState("error");
    }
  }, []);

  const stopTalking = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const localParticipant = room.localParticipant;
    for (const pub of localParticipant.trackPublications.values()) {
      if (pub.track && pub.track.kind === Track.Kind.Audio) {
        await localParticipant.unpublishTrack(pub.track);
      }
    }
    setState("connected");
  }, []);

  const disconnect = useCallback(() => {
    roomRef.current?.disconnect();
    roomRef.current = null;
    audioElRef.current?.remove();
    audioElRef.current = null;
    setState("idle");
  }, []);

  return { state, errorMessage, connect, startTalking, stopTalking, disconnect };
}
