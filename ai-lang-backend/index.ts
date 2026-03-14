// ─────────────────────────────────────────────────────────────────────────────
// Shared contract types — used by all three engineers.
// Frontend (Eng A) imports these for the WebSocket client.
// Backend (Eng B) uses them throughout the pipeline.
// DB layer (Eng C) uses PipelineMetrics for the interactions table.
// ─────────────────────────────────────────────────────────────────────────────

// ── Language support ──────────────────────────────────────────────────────────
export type SupportedLanguage = 'en-US' | 'fr-FR' | 'es-ES' | 'ar-SA' | 'pt-BR';

// ── REST API ──────────────────────────────────────────────────────────────────
export interface S2SRequest {
  /** Base64-encoded WAV/WebM audio from the browser */
  audioBase64: string;
  /** MIME type of the submitted audio */
  audioMimeType: 'audio/webm' | 'audio/wav' | 'audio/ogg';
  /** Language the user spoke in */
  sourceLanguage: SupportedLanguage;
  /** Language to translate + synthesize into */
  targetLanguage: SupportedLanguage;
  /** Scenario context for smarter translation prompts */
  scenarioId?: number;
  /** Device fingerprint — used instead of user accounts */
  deviceId: string;
}

export interface S2SResponse {
  success: true;
  /** Base64-encoded MP3 audio in the target language */
  audioBase64: string;
  /** Detected source text (for progress logging, never shown in UI) */
  sourceText: string;
  /** Translated text (for progress logging, never shown in UI) */
  translatedText: string;
  metrics: PipelineMetrics;
}

export interface S2SErrorResponse {
  success: false;
  /** Machine-readable code; frontend maps this to an earcon */
  audioHint: AudioHintCode;
  /** Human-readable message — logged only, never shown in UI */
  message: string;
}

// ── WebSocket protocol ────────────────────────────────────────────────────────
/** Sent by client to server to begin a streaming session */
export interface WsConfigFrame {
  type: 'config';
  sourceLanguage: SupportedLanguage;
  targetLanguage: SupportedLanguage;
  scenarioId?: number;
  deviceId: string;
  audioMimeType: 'audio/webm' | 'audio/wav';
}

/** Raw audio chunk — sent as binary (ArrayBuffer) over the WebSocket */
export type WsAudioChunk = ArrayBuffer;

/** Sent by client to signal end of recording */
export interface WsEndFrame {
  type: 'end';
}

/** Server → client: pipeline is processing */
export interface WsProcessingFrame {
  type: 'processing';
  stage: 'stt' | 'translation' | 'tts';
}

/** Server → client: final synthesized audio */
export interface WsResultFrame {
  type: 'result';
  audioBase64: string;
  sourceText: string;
  translatedText: string;
  metrics: PipelineMetrics;
}

/** Server → client: something went wrong */
export interface WsErrorFrame {
  type: 'error';
  audioHint: AudioHintCode;
  message: string;
}

export type WsServerFrame = WsProcessingFrame | WsResultFrame | WsErrorFrame;
export type WsClientFrame = WsConfigFrame | WsEndFrame;

// ── Metrics ───────────────────────────────────────────────────────────────────
export interface PipelineMetrics {
  /** ms from audio received → STT complete */
  sttLatencyMs: number;
  /** ms from STT complete → translation complete */
  translationLatencyMs: number;
  /** ms from translation complete → TTS complete */
  ttsLatencyMs: number;
  /** Total roundtrip from request received → audio sent */
  totalLatencyMs: number;
  /** Character count of recognized source text */
  sourceTextLength: number;
}

// ── Audio hint codes ──────────────────────────────────────────────────────────
/** Each code maps to a specific audio file in the frontend's /earcons/ folder */
export type AudioHintCode =
  | 'ERR_NO_SPEECH'        // No speech detected — play "try again" chime
  | 'ERR_LOW_CONFIDENCE'   // Speech recognized but low confidence
  | 'ERR_TRANSLATION_FAIL' // Translation API failure
  | 'ERR_TTS_FAIL'         // TTS synthesis failure
  | 'ERR_UNSUPPORTED_LANG' // Language pair not supported
  | 'ERR_AUDIO_TOO_LONG'   // Audio exceeds 60-second limit
  | 'ERR_RATE_LIMITED'     // Too many requests — play "slow down" sound
  | 'ERR_INTERNAL';        // Unexpected server error

// ── Scenario types (shared with DB layer / Eng C) ────────────────────────────
export interface Scenario {
  id: number;
  slug: 'job_application' | 'doctor_appointment' | 'everyday_language' | 'custom';
  /** Prompt injected into translation calls for domain-specific vocabulary */
  translationContext: string;
}
