// ═══════════════════════════════════════════════════════════════════
//  Shared API Types — Contract between Frontend, Backend, and Data
//  ALL three engineers import from this file.
// ═══════════════════════════════════════════════════════════════════

// ─── S2S Pipeline ───

export interface S2SRequest {
  audioContent: string;       // base64-encoded audio from browser mic
  sourceLanguage: string;     // BCP-47: "en-US", "en-GB"
  targetLanguage: string;     // BCP-47: "fr-FR", "es-ES"
  userId: number;
  scenarioId?: number;
  sessionId?: number;
}

export interface S2SResponse {
  originalText: string;
  translatedText: string;
  audioContent: string;       // base64-encoded MP3
  confidence: number;         // 0.0–1.0 from STT
  durationMs: number;         // total pipeline time
  sessionId: number;          // returned so frontend can reuse
}

export interface S2SError {
  error: string;              // machine-readable code
  message: string;            // human-readable (for logs, not UI)
  audioHint: AudioHint;       // frontend plays a sound for this
}

export type AudioHint =
  | "no_audio"
  | "didnt_understand"
  | "translation_failed"
  | "speech_failed"
  | "something_wrong"
  | "offline"
  | "rate_limited";

// ─── WebSocket Messages ───

export type WSClientMessage =
  | { type: "config"; sourceLanguage: string; targetLanguage: string; userId: number; scenarioId?: number }
  | { type: "end" }
  // Binary frames are raw audio chunks (not JSON)
  ;

export type WSServerMessage =
  | { type: "ready" }
  | { type: "listening"; chunkSize: number }
  | { type: "transcript"; text: string; confidence: number }
  | { type: "translation"; text: string }
  | { type: "audio"; content: string }
  | { type: "error"; audioHint: AudioHint; message: string };

// ─── Auth ───

export interface DeviceAuthRequest {
  deviceId: string;           // fingerprint hash from client
}

export interface DeviceAuthResponse {
  token: string;              // JWT
  userId: number;
  isNewUser: boolean;
}

export interface JWTPayload {
  userId: number;
  deviceId: string;
  iat: number;
  exp: number;
}

// ─── Scenarios ───

export interface Scenario {
  id: number;
  slug: string;
  iconEmoji: string;
  colorHex: string;
  sortOrder: number;
  isActive: boolean;
}

export interface ScenarioProgress {
  scenarioId: number;
  scenario: Scenario;
  interactionsCompleted: number;
  masteryScore: number | null;
  lastPracticedAt: Date | null;
}

// ─── User ───

export interface User {
  id: number;
  deviceId: string;
  displayName: string | null;
  nativeLanguage: string;
  targetLanguage: string;
  speechRate: number;
  createdAt: Date;
  lastActiveAt: Date;
}

export interface UserSummary {
  userId: number;
  totalSessions: number;
  totalInteractions: number;
  avgConfidence: number | null;
  avgResponseMs: number | null;
  lastSession: Date | null;
}

// ─── Sessions ───

export interface UserSession {
  id: number;
  userId: number;
  scenarioId: number | null;
  startedAt: Date;
  endedAt: Date | null;
  interactionCount: number;
  lastInteractionAt: Date | null;
  durationSeconds: number | null;
}

// ─── Interactions ───

export interface Interaction {
  id: number;
  sessionId: number;
  originalText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  confidenceScore: number;
  sttDurationMs: number;
  translateDurationMs: number;
  ttsDurationMs: number;
  totalDurationMs: number;
  userRating: 1 | 2 | null;
  createdAt: Date;
}

export interface PipelineMetrics {
  sttMs: number;
  translateMs: number;
  ttsMs: number;
  totalMs: number;
}

// ─── Offline Cache (used by frontend) ───

export interface CachedTranslation {
  sourceText: string;
  translatedText: string;
  audioContent: string;       // base64 MP3
  sourceLanguage: string;
  targetLanguage: string;
  cachedAt: number;           // timestamp ms
}
