// ═══════════════════════════════════════════════════════════════════
//  Data Access Layer — Scenario Progress
//  Tracks per-user completion and mastery per scenario.
// ═══════════════════════════════════════════════════════════════════

import { pool } from "../config/database.js";
import { ScenarioProgressRow, ScenarioRow } from "../types/db.js";
import type { Scenario, ScenarioProgress } from "../types/api.js";

function toScenario(row: ScenarioRow): Scenario {
  return {
    id: row.id,
    slug: row.slug,
    iconEmoji: row.icon_emoji,
    colorHex: row.color_hex,
    sortOrder: row.sort_order,
    isActive: row.is_active === 1,
  };
}

/**
 * Get all active scenarios.
 */
export async function getActiveScenarios(): Promise<Scenario[]> {
  const [rows] = await pool.execute<ScenarioRow[]>(
    "SELECT * FROM scenarios WHERE is_active = 1 ORDER BY sort_order"
  );
  return rows.map(toScenario);
}

/**
 * Get a user's progress across all scenarios.
 */
export async function getUserProgress(
  userId: number
): Promise<ScenarioProgress[]> {
  const [rows] = await pool.execute<(ScenarioProgressRow & ScenarioRow)[]>(
    `SELECT sp.*, s.slug, s.icon_emoji, s.color_hex, s.sort_order, s.is_active
     FROM scenario_progress sp
     JOIN scenarios s ON sp.scenario_id = s.id
     WHERE sp.user_id = ?
     ORDER BY s.sort_order`,
    [userId]
  );

  return rows.map((row) => ({
    scenarioId: row.scenario_id,
    scenario: {
      id: row.scenario_id,
      slug: row.slug,
      iconEmoji: row.icon_emoji,
      colorHex: row.color_hex,
      sortOrder: row.sort_order,
      isActive: row.is_active === 1,
    },
    interactionsCompleted: row.interactions_completed,
    masteryScore: row.mastery_score != null ? parseFloat(row.mastery_score) : null,
    lastPracticedAt: row.last_practiced_at,
  }));
}

/**
 * Record a completed interaction for a scenario.
 * Uses UPSERT — creates progress row on first interaction.
 */
export async function recordScenarioInteraction(
  userId: number,
  scenarioId: number
): Promise<void> {
  await pool.execute(
    `INSERT INTO scenario_progress (user_id, scenario_id, interactions_completed, last_practiced_at)
     VALUES (?, ?, 1, NOW())
     ON DUPLICATE KEY UPDATE
       interactions_completed = interactions_completed + 1,
       last_practiced_at = NOW()`,
    [userId, scenarioId]
  );
}

/**
 * Recompute mastery score for a user+scenario.
 * Mastery = rolling average confidence of last 20 interactions in that scenario.
 * Scale: 0–100.
 */
export async function updateMasteryScore(
  userId: number,
  scenarioId: number
): Promise<number | null> {
  const [rows] = await pool.execute<any[]>(
    `SELECT AVG(i.confidence_score) * 100 AS mastery
     FROM (
       SELECT i2.confidence_score
       FROM interactions i2
       JOIN user_sessions us ON i2.session_id = us.id
       WHERE us.user_id = ? AND us.scenario_id = ?
       ORDER BY i2.created_at DESC
       LIMIT 20
     ) i`,
    [userId, scenarioId]
  );

  const mastery = rows[0]?.mastery;
  if (mastery == null) return null;

  const score = Math.round(parseFloat(mastery) * 100) / 100;

  await pool.execute(
    `UPDATE scenario_progress
     SET mastery_score = ?
     WHERE user_id = ? AND scenario_id = ?`,
    [score, userId, scenarioId]
  );

  return score;
}

/**
 * Get scenario prompts for a given language (for audio narration).
 */
export async function getScenarioPrompts(
  scenarioId: number,
  language = "en"
): Promise<string[]> {
  const [rows] = await pool.execute<any[]>(
    `SELECT prompt_text FROM scenario_prompts
     WHERE scenario_id = ? AND language = ?
     ORDER BY sort_order`,
    [scenarioId, language]
  );
  return rows.map((r: any) => r.prompt_text);
}
