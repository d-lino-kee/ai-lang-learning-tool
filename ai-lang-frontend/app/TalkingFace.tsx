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
  const [name, setName] = useState("");
  const [hasName, setHasName] = useState(false);

  const isRecording = status === "recording";

  useEffect(() => {
    if (hasGreeted) return;
    setHasGreeted(true);

    const text = "Hi, I am your language tutor. What is your name?";

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
      // Later, signal to the backend that the user finished speaking.
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const handleNameSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      if (!name.trim()) return;
      setHasName(true);
      // Later, send chosen name to backend when available.
      router.push("/scenarios");
    },
    [name, router],
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-black text-white">
      <main className="flex w-full max-w-xl flex-col items-center gap-8 px-6 py-12 text-center">
        <Face speaking={speaking || isRecording} />

        <div className="flex flex-col items-center gap-4">
          <p className="text-lg text-zinc-200">
            {hasName
              ? `Nice to meet you, ${name.trim()}. When you are ready, press the microphone and start speaking.`
              : "Hi! I am your language tutor. What is your name?"}
          </p>

          {!hasName && (
            <form
              onSubmit={handleNameSubmit}
              className="flex w-full max-w-xs items-center gap-2"
            >
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Enter your name"
                className="h-9 flex-1 rounded-full border border-zinc-700 bg-black/60 px-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-zinc-400"
              />
              <button
                type="submit"
                className="h-9 rounded-full bg-zinc-200 px-4 text-sm font-medium text-black hover:bg-white"
              >
                OK
              </button>
            </form>
          )}
        </div>

        <button
          type="button"
          onClick={handleMicToggle}
          className={`mt-4 flex h-14 w-14 items-center justify-center rounded-full text-xl font-semibold transition ${
            isRecording ? "bg-red-500" : "bg-zinc-800 hover:bg-zinc-700"
          }`}
        >
          {isRecording ? "■" : "🎤"}
        </button>

        <p className="text-xs text-zinc-500">
          {isRecording
            ? "Recording… press the button again when you are done speaking."
            : "Press the microphone to start speaking."}
        </p>
      </main>
    </div>
  );
}

