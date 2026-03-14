// ─────────────────────────────────────────────────────────────────────────────
// Shared contract types — used by all three engineers.
// Frontend (Eng A) imports these for the WebSocket client.
// Backend (Eng B) uses them throughout the pipeline.
// DB layer (Eng C) uses PipelineMetrics for the interactions table.
// ─────────────────────────────────────────────────────────────────────────────

// ── Language support ──────────────────────────────────────────────────────────
export type SupportedLanguage = 'en-US' | 'fr-FR' | 'es-ES' | 'ar-SA' | 'pt-BR';

// ── Immersion level — controls how much target language the AI uses ───────────
// 0 = fully in native language (English)
// 100 = fully in target language (French)
// The app starts at 0 and gradually increases this as the user progresses.
export type ImmersionLevel = 0 | 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 | 100;

// ── REST API ──────────────────────────────────────────────────────────────────
export interface S2SRequest {
  /** Base64-encoded WAV/WebM audio from the browser */
  audioBase64: string;
  /** MIME type of the submitted audio */
  audioMimeType: 'audio/webm' | 'audio/wav' | 'audio/ogg';
  /** The user's native language — what they speak in */
  nativeLanguage: SupportedLanguage;
  /** The language the user is learning */
  targetLanguage: SupportedLanguage;
  /** How much target language to use in the response (0–100) */
  immersionLevel: ImmersionLevel;
  /** Scenario context — shapes the AI's role and vocabulary */
  scenarioId?: number;
  /** Device fingerprint — used instead of user accounts */
  deviceId: string;
}

export interface S2SResponse {
  success: true;
  /** Base64-encoded MP3 audio of the AI's response */
  audioBase64: string;
  /** What the user said (transcribed from their audio) */
  sourceText: string;
  /** The AI's generated response text — for progress logging, never shown in UI */
  aiResponseText: string;
  /** The immersion level that was used for this response */
  immersionLevel: ImmersionLevel;
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
  nativeLanguage: SupportedLanguage;
  targetLanguage: SupportedLanguage;
  immersionLevel: ImmersionLevel;
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
  stage: 'stt' | 'ai' | 'tts';
}

/** Server → client: final synthesized audio */
export interface WsResultFrame {
  type: 'result';
  audioBase64: string;
  sourceText: string;
  aiResponseText: string;
  immersionLevel: ImmersionLevel;
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
  /** ms from STT complete → Gemini response complete */
  aiLatencyMs: number;
  /** ms from AI response → TTS complete */
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
  | 'ERR_AI_FAIL'          // Gemini AI failure
  | 'ERR_TTS_FAIL'         // TTS synthesis failure
  | 'ERR_UNSUPPORTED_LANG' // Language pair not supported
  | 'ERR_AUDIO_TOO_LONG'   // Audio exceeds 60-second limit
  | 'ERR_RATE_LIMITED'     // Too many requests — play "slow down" sound
  | 'ERR_INTERNAL';        // Unexpected server error

// ── Scenario types (shared with DB layer / Eng C) ────────────────────────────
export interface Scenario {
  id: number;
  slug: 'job_application' | 'doctor_appointment' | 'everyday_language' | 'custom';
  /** Prompt injected into Gemini for domain-specific vocabulary */
  aiContext: string;
}
