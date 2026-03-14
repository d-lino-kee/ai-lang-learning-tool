// ═══════════════════════════════════════════════════════════════════
//  Data Access Layer — Interactions
//  Logs S2S pipeline interactions and provides query methods.
// ═══════════════════════════════════════════════════════════════════

import { pool } from "../config/database.js";
import { ResultSetHeader } from "mysql2/promise";
import { InteractionRow } from "../types/db.js";
import type { Interaction, PipelineMetrics } from "../types/api.js";
import { incrementInteractionCount } from "./sessions.js";

function toInteraction(row: InteractionRow): Interaction {
  return {
    id: row.id,
    sessionId: row.session_id,
    originalText: row.original_text,
    translatedText: row.translated_text,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    confidenceScore: parseFloat(row.confidence_score),
    sttDurationMs: row.stt_duration_ms,
    translateDurationMs: row.translate_duration_ms,
    ttsDurationMs: row.tts_duration_ms,
    totalDurationMs: row.total_duration_ms,
    userRating: row.user_rating as 1 | 2 | null,
    createdAt: row.created_at,
  };
}

/**
 * Log a pipeline interaction. Non-blocking — caller should
 * fire-and-forget with .catch() to avoid slowing the response.
 */
export async function logInteraction(
  sessionId: number,
  originalText: string,
  translatedText: string,
  sourceLanguage: string,
  targetLanguage: string,
  confidence: number,
  metrics: PipelineMetrics
): Promise<number> {
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO interactions
      (session_id, original_text, translated_text,
       source_language, target_language, confidence_score,
       stt_duration_ms, translate_duration_ms, tts_duration_ms,
       total_duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      sessionId,
      originalText,
      translatedText,
      sourceLanguage,
      targetLanguage,
      confidence,
      metrics.sttMs,
      metrics.translateMs,
      metrics.ttsMs,
      metrics.totalMs,
    ]
  );

  // Also bump session counter
  await incrementInteractionCount(sessionId);

  return result.insertId;
}

/**
 * Get interactions for a session.
 */
export async function getSessionInteractions(
  sessionId: number,
  limit = 50
): Promise<Interaction[]> {
  const [rows] = await pool.execute<InteractionRow[]>(
    `SELECT * FROM interactions
     WHERE session_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [sessionId, limit]
  );
  return rows.map(toInteraction);
}

/**
 * Set user rating on an interaction (thumbs up/down).
 */
export async function rateInteraction(
  interactionId: number,
  rating: 1 | 2
): Promise<void> {
  await pool.execute(
    "UPDATE interactions SET user_rating = ? WHERE id = ?",
    [rating, interactionId]
  );
}

/**
 * Get average confidence for a user across all interactions.
 */
export async function getUserAvgConfidence(
  userId: number
): Promise<number | null> {
  const [rows] = await pool.execute<any[]>(
    `SELECT AVG(i.confidence_score) AS avg_conf
     FROM interactions i
     JOIN user_sessions us ON i.session_id = us.id
     WHERE us.user_id = ?`,
    [userId]
  );
  const val = rows[0]?.avg_conf;
  return val != null ? parseFloat(val) : null;
}

/**
 * Get average pipeline latency over recent interactions.
 */
export async function getAvgLatency(
  userId: number,
  recentCount = 50
): Promise<{ sttMs: number; translateMs: number; ttsMs: number; totalMs: number } | null> {
  const [rows] = await pool.execute<any[]>(
    `SELECT
       AVG(i.stt_duration_ms) AS avg_stt,
       AVG(i.translate_duration_ms) AS avg_translate,
       AVG(i.tts_duration_ms) AS avg_tts,
       AVG(i.total_duration_ms) AS avg_total
     FROM (
       SELECT i2.* FROM interactions i2
       JOIN user_sessions us ON i2.session_id = us.id
       WHERE us.user_id = ?
       ORDER BY i2.created_at DESC
       LIMIT ?
     ) i`,
    [userId, recentCount]
  );
  const r = rows[0];
  if (!r || r.avg_total == null) return null;
  return {
    sttMs: Math.round(parseFloat(r.avg_stt)),
    translateMs: Math.round(parseFloat(r.avg_translate)),
    ttsMs: Math.round(parseFloat(r.avg_tts)),
    totalMs: Math.round(parseFloat(r.avg_total)),
  };
}
