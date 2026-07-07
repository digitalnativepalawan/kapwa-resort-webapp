import { useEffect } from "react";
import { useTalaVoice } from "./hooks/useTalaVoice";
import { MicButton } from "./components/MicButton";

export default function App() {
  const { state, errorMessage, connect, startTalking, stopTalking, disconnect } =
    useTalaVoice();

  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  const handleMicTap = () => {
    if (state === "idle") {
      void connect();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 px-6 bg-limestone">
      <div className="text-center">
        <h1 className="font-serif text-4xl text-ocean">TALA</h1>
        <p className="text-bronze mt-1">KAPWA OS Boutique Resort · San Vicente, Palawan</p>
      </div>

      <MicButton
        state={state}
        onPress={() => {
          if (state === "idle") {
            handleMicTap();
            return;
          }
          void startTalking();
        }}
        onRelease={() => void stopTalking()}
      />

      {errorMessage && (
        <p className="text-red-700 text-sm max-w-xs text-center">{errorMessage}</p>
      )}

      <p className="text-sandstone text-xs max-w-xs text-center">
        Tap once to connect, then hold the mic while you speak. Release when
        you're done — TALA will reply po.
      </p>
    </div>
  );
}
