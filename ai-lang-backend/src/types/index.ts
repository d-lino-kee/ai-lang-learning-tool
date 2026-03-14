// ─────────────────────────────────────────────────────────────────────────────
// Shared contract types — used by all three engineers.
// Frontend (Eng A) imports these for the WebSocket client.
// Backend (Eng B) uses them throughout the pipeline.
// DB layer (Eng C) uses PipelineMetrics for the interactions table.
// ─────────────────────────────────────────────────────────────────────────────

// ── Language support ──────────────────────────────────────────────────────────
export type SupportedLanguage = 'en-US' | 'fr-FR' | 'es-ES' | 'ar-SA' | 'pt-BR';

// ── Immersion level — controls how much target language the AI uses ───────────
// 0 = fully in native language (e.g. English)
// 100 = fully in target language (e.g. French)
// Advances automatically every 5 successful exchanges
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
  /** Combined feedback + reply as a single audio track — simplest for Engineer A */
  audioBase64: string;
  /** Feedback audio only — e.g. "Almost! Say je veux, not je vouloir" */
  feedbackAudioBase64: string;
  /** Conversational reply audio only — the continuation after feedback */
  replyAudioBase64: string;
  /** What the user said (transcribed from their audio) */
  sourceText: string;
  /** Full AI response text (feedback + reply combined) — for logging */
  aiResponseText: string;
  /** Just the feedback portion — for logging */
  feedbackText: string;
  /** Just the conversational reply portion — for logging */
  replyText: string;
  /** Whether the user attempted to speak in the target language this turn */
  hadTargetLanguage: boolean;
  /** The immersion level active for this response */
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

/** Server → client: final synthesized audio with feedback and reply separated */
export interface WsResultFrame {
  type: 'result';
  audioBase64: string;
  feedbackAudioBase64: string;
  replyAudioBase64: string;
  sourceText: string;
  aiResponseText: string;
  feedbackText: string;
  replyText: string;
  hadTargetLanguage: boolean;
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
  | 'ERR_NO_SPEECH'        // No speech detected
  | 'ERR_LOW_CONFIDENCE'   // Speech recognized but low confidence
  | 'ERR_AI_FAIL'          // Gemini AI failure
  | 'ERR_TTS_FAIL'         // TTS synthesis failure
  | 'ERR_UNSUPPORTED_LANG' // Language pair not supported
  | 'ERR_AUDIO_TOO_LONG'   // Audio exceeds 60-second limit
  | 'ERR_RATE_LIMITED'     // Too many requests
  | 'ERR_INTERNAL';        // Unexpected server error

// ── Scenario types (shared with DB layer / Eng C) ────────────────────────────
export interface Scenario {
  id: number;
  slug: 'job_application' | 'doctor_appointment' | 'everyday_language' | 'custom';
  aiContext: string;
}
