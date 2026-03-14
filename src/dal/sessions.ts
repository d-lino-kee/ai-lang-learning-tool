// ═══════════════════════════════════════════════════════════════════
//  Data Access Layer — Sessions
//  CRUD operations for user_sessions table.
// ═══════════════════════════════════════════════════════════════════

import { pool } from "../config/database.js";
import { ResultSetHeader } from "mysql2/promise";
import { UserSessionRow } from "../types/db.js";
import type { UserSession } from "../types/api.js";

// ─── Row → Domain mapping ───
function toSession(row: UserSessionRow): UserSession {
  return {
    id: row.id,
    userId: row.user_id,
    scenarioId: row.scenario_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    interactionCount: row.interaction_count,
    lastInteractionAt: row.last_interaction_at,
    durationSeconds: row.duration_seconds,
  };
}

/**
 * Create a new session. Returns the session ID.
 */
export async function createSession(
  userId: number,
  scenarioId?: number
): Promise<number> {
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO user_sessions (user_id, scenario_id, started_at)
     VALUES (?, ?, NOW())`,
    [userId, scenarioId ?? null]
  );
  return result.insertId;
}

/**
 * End a session by setting ended_at.
 */
export async function endSession(sessionId: number): Promise<void> {
  await pool.execute(
    `UPDATE user_sessions SET ended_at = NOW() WHERE id = ? AND ended_at IS NULL`,
    [sessionId]
  );
}

/**
 * Get the most recent active (un-ended) session for a user.
 * Returns null if no active session exists.
 */
export async function getActiveSession(
  userId: number
): Promise<UserSession | null> {
  const [rows] = await pool.execute<UserSessionRow[]>(
    `SELECT * FROM user_sessions
     WHERE user_id = ? AND ended_at IS NULL
     ORDER BY started_at DESC
     LIMIT 1`,
    [userId]
  );
  return rows.length > 0 ? toSession(rows[0]) : null;
}

/**
 * Get a session by ID.
 */
export async function getSessionById(
  sessionId: number
): Promise<UserSession | null> {
  const [rows] = await pool.execute<UserSessionRow[]>(
    "SELECT * FROM user_sessions WHERE id = ?",
    [sessionId]
  );
  return rows.length > 0 ? toSession(rows[0]) : null;
}

/**
 * Get session history for a user, most recent first.
 */
export async function getSessionHistory(
  userId: number,
  limit = 20,
  offset = 0
): Promise<UserSession[]> {
  const [rows] = await pool.execute<UserSessionRow[]>(
    `SELECT * FROM user_sessions
     WHERE user_id = ?
     ORDER BY started_at DESC
     LIMIT ? OFFSET ?`,
    [userId, limit, offset]
  );
  return rows.map(toSession);
}

/**
 * Increment interaction count and update last_interaction_at.
 * Called by the interactions DAL after logging an interaction.
 */
export async function incrementInteractionCount(
  sessionId: number
): Promise<void> {
  await pool.execute(
    `UPDATE user_sessions
     SET interaction_count = interaction_count + 1,
         last_interaction_at = NOW()
     WHERE id = ?`,
    [sessionId]
  );
}

/**
 * End all stale sessions (active for more than 2 hours).
 * Useful as a periodic cleanup job.
 */
export async function endStaleSessions(): Promise<number> {
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE user_sessions
     SET ended_at = NOW()
     WHERE ended_at IS NULL
       AND started_at < DATE_SUB(NOW(), INTERVAL 2 HOUR)`
  );
  return result.affectedRows;
}
