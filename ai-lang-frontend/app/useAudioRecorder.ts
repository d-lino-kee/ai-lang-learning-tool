import { useCallback, useEffect, useRef, useState } from "react";

type UseAudioRecorderOptions = {
  /** Called whenever a new audio chunk is available */
  onChunk?: (chunk: Blob) => void;
  /** Mime type hint for MediaRecorder, e.g. "audio/webm" */
  mimeType?: string;
  /** Timeslice in ms for MediaRecorder.ondataavailable */
  timesliceMs?: number;
};

type RecorderStatus = "idle" | "recording" | "error";

export function useAudioRecorder(options: UseAudioRecorderOptions = {}) {
  const { onChunk, mimeType = "audio/webm", timesliceMs = 500 } = options;

  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [chunkCount, setChunkCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    recorderRef.current = null;
    setStatus("idle");
  }, []);

  const startRecording = useCallback(async () => {
    if (status === "recording") return;

    try {
      setError(null);
      setChunkCount(0);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (!event.data || event.data.size === 0) return;

        setChunkCount((prev) => prev + 1);
        // For now, log the blob and chunk count.
        // Later, you can send `event.data` to your backend.
        // eslint-disable-next-line no-console
        console.log("Audio chunk received", {
          size: event.data.size,
          type: event.data.type,
        });

        onChunk?.(event.data);
      };

      recorder.onerror = (event) => {
        const message =
          (event.error && event.error.message) || "Unknown recorder error";
        setError(message);
        setStatus("error");
        stopRecording();
      };

      recorder.start(timesliceMs);
      setStatus("recording");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start recording";
      setError(message);
      setStatus("error");
    }
  }, [mimeType, onChunk, status, stopRecording, timesliceMs]);

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  return {
    status,
    chunkCount,
    error,
    startRecording,
    stopRecording,
  };
}

