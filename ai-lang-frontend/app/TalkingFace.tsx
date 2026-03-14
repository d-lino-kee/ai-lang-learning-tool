"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAudioRecorder } from "./useAudioRecorder";

type FaceProps = {
  speaking: boolean;
};

export function Face({ speaking }: FaceProps) {
  return (
    <div className="face">
      <div className="face-eye face-eye--left" />
      <div className="face-eye face-eye--right" />
      <div className="face-cheek face-cheek--left" />
      <div className="face-cheek face-cheek--right" />
      <div className={`face-mouth${speaking ? " face-mouth--speaking" : ""}`} />
    </div>
  );
}

export function TalkingFace() {
  const router = useRouter();
  const { status, startRecording, stopRecording } = useAudioRecorder();
  const [speaking, setSpeaking] = useState(false);
  const [hasGreeted, setHasGreeted] = useState(false);
  const [showMicHint, setShowMicHint] = useState(true);

  const isRecording = status === "recording";

  useEffect(() => {
    if (hasGreeted) return;
    setHasGreeted(true);

    const text =
      "Hi, I am your language tutor. What is your name? When you are ready, press the microphone to say your name. Press it again when you are finished.";

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      setSpeaking(true);

      utterance.onend = () => {
        setSpeaking(false);
      };

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }
  }, [hasGreeted]);

  const handleMicToggle = useCallback(() => {
    if (isRecording) {
      stopRecording();
      setShowMicHint(false);
      // Later, backend will extract the name from this audio,
      // then we move on to the scenarios page.
      router.push("/scenarios");
    } else {
      setShowMicHint(false);
      startRecording();
    }
  }, [isRecording, router, startRecording, stopRecording]);

  const micClasses = [
    "mt-8 flex h-14 w-14 items-center justify-center rounded-full text-xl font-semibold transition",
    isRecording ? "bg-red-500" : "bg-zinc-800 hover:bg-zinc-700",
    !isRecording && showMicHint
      ? "ring-2 ring-emerald-300 ring-offset-2 ring-offset-black animate-pulse"
      : "",
  ].join(" ");

  return (
    <div className="flex min-h-screen items-center justify-center bg-black text-white">
      <main className="flex w-full max-w-xl flex-col items-center gap-8 px-6 py-12 text-center">
        <Face speaking={speaking} />

        <button type="button" onClick={handleMicToggle} className={micClasses}>
          {isRecording ? "■" : "🎤"}
        </button>
      </main>
    </div>
  );
}

