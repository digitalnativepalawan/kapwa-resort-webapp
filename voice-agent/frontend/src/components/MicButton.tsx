import type { SessionState } from "../hooks/useTalaVoice";

interface MicButtonProps {
  state: SessionState;
  onPress: () => void;
  onRelease: () => void;
}

const STATE_LABEL: Record<SessionState, string> = {
  idle: "Tap to start",
  connecting: "Connecting…",
  connected: "Tap and hold to talk",
  listening: "Listening…",
  speaking: "TALA is speaking…",
  error: "Something went wrong",
};

export function MicButton({ state, onPress, onRelease }: MicButtonProps) {
  const disabled = state === "connecting" || state === "speaking";
  const active = state === "listening";

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        type="button"
        disabled={disabled}
        onMouseDown={onPress}
        onMouseUp={onRelease}
        onTouchStart={onPress}
        onTouchEnd={onRelease}
        className={[
          "h-28 w-28 rounded-full border-4 transition-all duration-150 select-none",
          "flex items-center justify-center text-3xl",
          active
            ? "bg-forest border-forest scale-110 shadow-lg"
            : "bg-ocean border-ocean",
          disabled ? "opacity-50" : "active:scale-95",
        ].join(" ")}
        aria-label="Hold to talk to TALA"
      >
        🎙️
      </button>
      <p className="font-serif text-ocean text-lg">{STATE_LABEL[state]}</p>
    </div>
  );
}
