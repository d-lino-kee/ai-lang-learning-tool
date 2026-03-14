"use client";

import { useCallback, useState } from "react";
import { Face } from "../TalkingFace";
import { useAudioRecorder } from "../useAudioRecorder";

const SCENARIOS = [
  {
    id: "everyday",
    ariaLabel: "Everyday conversation",
    colorFrom: "from-emerald-400",
    colorTo: "to-emerald-700",
    icon: "🏠",
  },
  {
    id: "restaurant",
    ariaLabel: "Ordering at a restaurant",
    colorFrom: "from-amber-300",
    colorTo: "to-orange-700",
    icon: "🍽️",
  },
  {
    id: "directions",
    ariaLabel: "Asking for directions",
    colorFrom: "from-sky-400",
    colorTo: "to-indigo-700",
    icon: "🧭",
  },
];

export default function ScenariosPage() {
  const { status, startRecording, stopRecording } = useAudioRecorder();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const isRecording = status === "recording";

  const handleMicToggle = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    // Later, send chosen scenario to backend when available.
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-black text-white">
      <main className="flex w-full max-w-3xl flex-col items-center gap-8 px-6 py-12 text-center">
        <Face speaking={false} />

        <section className="w-full max-w-3xl rounded-3xl border border-zinc-800 bg-zinc-900/40 p-5 shadow-lg">
          <div className="flex flex-col items-center gap-4">
            <div className="flex w-full flex-row flex-wrap items-stretch justify-center gap-4">
            {SCENARIOS.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                onClick={() => handleSelect(scenario.id)}
                  aria-label={scenario.ariaLabel}
                  className={`group relative flex h-40 w-32 flex-col items-center justify-center rounded-3xl bg-gradient-to-br ${scenario.colorFrom} ${scenario.colorTo} text-3xl transition-transform duration-150 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 ${
                  selectedId === scenario.id
                      ? "ring-2 ring-offset-2 ring-offset-black ring-white"
                      : ""
                }`}
              >
                  <span className="drop-shadow-md">{scenario.icon}</span>
                  {selectedId === scenario.id && (
                    <span className="absolute bottom-3 h-1.5 w-10 rounded-full bg-white/90" />
                  )}
              </button>
            ))}
            </div>
          </div>
        </section>

        <button
          type="button"
          onClick={handleMicToggle}
          className={`mt-2 flex h-14 w-14 items-center justify-center rounded-full text-xl font-semibold transition ${
            isRecording ? "bg-red-500" : "bg-zinc-800 hover:bg-zinc-700"
          }`}
        >
          {isRecording ? "■" : "🎤"}
        </button>

        <p className="text-xs text-zinc-500"> </p>
      </main>
    </div>
  );
}

