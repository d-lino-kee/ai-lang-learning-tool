import { pool } from './connection';
import { PipelineMetrics, AudioHintCode, SupportedLanguage } from '../types';

export interface InteractionLog {
  deviceId: string;
  scenarioId: number | null;
  sourceLanguage: SupportedLanguage;
  targetLanguage: SupportedLanguage;
  success: boolean;
  sourceText: string | null;
  translatedText: string | null;
  audioHint: AudioHintCode | null;
  metrics: PipelineMetrics | null;
}

export async function logInteraction(log: InteractionLog): Promise<void> {
  // Upsert device to users table (device-based identity — no accounts needed)
  await pool.execute(
    `INSERT INTO users (device_id) VALUES (?)
     ON DUPLICATE KEY UPDATE last_seen_at = CURRENT_TIMESTAMP`,
    [log.deviceId]
  );

  // Get the user's internal ID
  const [rows] = await pool.execute<any[]>(
    'SELECT id FROM users WHERE device_id = ?',
    [log.deviceId]
  );
  const userId: number = rows[0].id;

  // Insert interaction record
  await pool.execute(
    `INSERT INTO interactions (
      user_id, scenario_id,
      source_language, target_language,
      source_text, translated_text,
      success, audio_hint_code,
      stt_latency_ms, translation_latency_ms,
      tts_latency_ms, total_latency_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      log.scenarioId,
      log.sourceLanguage,
      log.targetLanguage,
      log.sourceText,
      log.translatedText,
      log.success ? 1 : 0,
      log.audioHint,
      log.metrics?.sttLatencyMs ?? null,
      log.metrics?.translationLatencyMs ?? null,
      log.metrics?.ttsLatencyMs ?? null,
      log.metrics?.totalLatencyMs ?? null,
    ]
  );

  // Update scenario progress if applicable
  if (log.scenarioId && log.success) {
    await pool.execute(
      `INSERT INTO scenario_progress (user_id, scenario_id, attempts, last_attempted_at)
       VALUES (?, ?, 1, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
         attempts = attempts + 1,
         last_attempted_at = CURRENT_TIMESTAMP`,
      [userId, log.scenarioId]
    );
  }
}
