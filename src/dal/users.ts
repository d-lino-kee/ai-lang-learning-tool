// ═══════════════════════════════════════════════════════════════════
//  Data Access Layer — Users
// ═══════════════════════════════════════════════════════════════════

import { pool } from "../config/database.js";
import { ResultSetHeader } from "mysql2/promise";
import { UserRow, UserSummaryRow } from "../types/db.js";
import type { User, UserSummary } from "../types/api.js";

function toUser(row: UserRow): User {
  return {
    id: row.id,
    deviceId: row.device_id,
    displayName: row.display_name,
    nativeLanguage: row.native_language,
    targetLanguage: row.target_language,
    speechRate: parseFloat(row.speech_rate),
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
  };
}

/**
 * Find user by device ID. Returns null if not found.
 */
export async function findByDeviceId(deviceId: string): Promise<User | null> {
  const [rows] = await pool.execute<UserRow[]>(
    "SELECT * FROM users WHERE device_id = ?",
    [deviceId]
  );
  return rows.length > 0 ? toUser(rows[0]) : null;
}

/**
 * Find user by ID.
 */
export async function findById(userId: number): Promise<User | null> {
  const [rows] = await pool.execute<UserRow[]>(
    "SELECT * FROM users WHERE id = ?",
    [userId]
  );
  return rows.length > 0 ? toUser(rows[0]) : null;
}

/**
 * Create a new user from a device fingerprint.
 * Returns the new user.
 */
export async function createUser(
  deviceId: string,
  nativeLanguage = "en",
  targetLanguage = "fr"
): Promise<User> {
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO users (device_id, native_language, target_language)
     VALUES (?, ?, ?)`,
    [deviceId, nativeLanguage, targetLanguage]
  );

  const user = await findById(result.insertId);
  if (!user) throw new Error("Failed to create user");
  return user;
}

/**
 * Update user preferences (target language, speech rate, display name).
 */
export async function updatePreferences(
  userId: number,
  updates: {
    targetLanguage?: string;
    speechRate?: number;
    displayName?: string | null;
  }
): Promise<void> {
  const sets: string[] = [];
  const values: any[] = [];

  if (updates.targetLanguage !== undefined) {
    sets.push("target_language = ?");
    values.push(updates.targetLanguage);
  }
  if (updates.speechRate !== undefined) {
    sets.push("speech_rate = ?");
    values.push(updates.speechRate);
  }
  if (updates.displayName !== undefined) {
    sets.push("display_name = ?");
    values.push(updates.displayName);
  }

  if (sets.length === 0) return;

  values.push(userId);
  await pool.execute(
    `UPDATE users SET ${sets.join(", ")} WHERE id = ?`,
    values
  );
}

/**
 * Get user summary from the view.
 */
export async function getUserSummary(
  userId: number
): Promise<UserSummary | null> {
  const [rows] = await pool.execute<UserSummaryRow[]>(
    "SELECT * FROM v_user_summary WHERE user_id = ?",
    [userId]
  );

  if (rows.length === 0) return null;
  const row = rows[0];

  return {
    userId: row.user_id,
    totalSessions: row.total_sessions,
    totalInteractions: row.total_interactions,
    avgConfidence: row.avg_confidence != null ? parseFloat(row.avg_confidence) : null,
    avgResponseMs: row.avg_response_ms != null ? parseFloat(row.avg_response_ms) : null,
    lastSession: row.last_session,
  };
}

/**
 * Touch last_active_at for a user (called on each request via middleware).
 */
export async function touchLastActive(userId: number): Promise<void> {
  await pool.execute(
    "UPDATE users SET last_active_at = NOW() WHERE id = ?",
    [userId]
  );
}
