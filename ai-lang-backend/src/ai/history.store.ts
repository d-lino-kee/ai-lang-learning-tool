import { ConversationMessage } from './conversation.ai';

// ─────────────────────────────────────────────────────────────────────────────
// In-memory conversation history store
//
// Keeps the last N messages per device so Gemini remembers the conversation.
// Also tracks immersion level progress per device so the app knows how far
// along the user is in their language transition.
// ─────────────────────────────────────────────────────────────────────────────

import { ImmersionLevel } from '../types';

const MAX_HISTORY = 20;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ── How many successful exchanges before the immersion level goes up ──────────
const EXCHANGES_PER_LEVEL_UP = 5;

interface SessionEntry {
  history: ConversationMessage[];
  immersionLevel: ImmersionLevel;
  successfulExchanges: number; // Count since last level-up
  lastActivityAt: number;
}

const store = new Map<string, SessionEntry>();

function sessionKey(deviceId: string, scenarioId?: number): string {
  return `${deviceId}:${scenarioId ?? 'none'}`;
}

// ── Get conversation history ──────────────────────────────────────────────────
export function getHistory(
  deviceId: string,
  scenarioId?: number
): ConversationMessage[] {
  const key = sessionKey(deviceId, scenarioId);
  return store.get(key)?.history ?? [];
}

// ── Get current immersion level for a session ─────────────────────────────────
export function getImmersionLevel(
  deviceId: string,
  scenarioId?: number
): ImmersionLevel {
  const key = sessionKey(deviceId, scenarioId);
  return store.get(key)?.immersionLevel ?? 0;
}

// ── Append exchange and auto-advance immersion level ─────────────────────────
// Returns the immersion level that was active for this exchange.
export function appendToHistory(
  deviceId: string,
  userText: string,
  aiResponse: string,
  scenarioId?: number
): ImmersionLevel {
  const key = sessionKey(deviceId, scenarioId);
  const existing = store.get(key);

  const history: ConversationMessage[] = existing?.history ?? [];
  let immersionLevel: ImmersionLevel = existing?.immersionLevel ?? 0;
  let successfulExchanges = (existing?.successfulExchanges ?? 0) + 1;

  // Append new messages
  history.push({ role: 'user', parts: [{ text: userText }] });
  history.push({ role: 'model', parts: [{ text: aiResponse }] });

  // Trim oldest messages if over limit
  while (history.length > MAX_HISTORY) {
    history.splice(0, 2);
  }

  // Auto-advance immersion level every N successful exchanges
  if (successfulExchanges >= EXCHANGES_PER_LEVEL_UP && immersionLevel < 100) {
    immersionLevel = Math.min(100, immersionLevel + 10) as ImmersionLevel;
    successfulExchanges = 0; // Reset counter after level-up
  }

  store.set(key, {
    history,
    immersionLevel,
    successfulExchanges,
    lastActivityAt: Date.now(),
  });

  return immersionLevel;
}

// ── Clear history and reset immersion for a session ───────────────────────────
export function clearHistory(deviceId: string, scenarioId?: number): void {
  const key = sessionKey(deviceId, scenarioId);
  store.delete(key);
}

// ── Purge stale sessions ──────────────────────────────────────────────────────
export function purgestaleSessions(): void {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now - entry.lastActivityAt > SESSION_TTL_MS) {
      store.delete(key);
    }
  }
}

setInterval(purgestaleSessions, 10 * 60 * 1000);
