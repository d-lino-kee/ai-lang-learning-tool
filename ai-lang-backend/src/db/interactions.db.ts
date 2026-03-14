import { pool } from './connection';
import { PipelineMetrics, AudioHintCode, SupportedLanguage, ImmersionLevel } from '../types';

export interface InteractionLog {
  deviceId: string;
  scenarioId: number | null;
  nativeLanguage: SupportedLanguage;
  targetLanguage: SupportedLanguage;
  immersionLevel: ImmersionLevel;
  success: boolean;
  sourceText: string | null;
  aiResponseText: string | null;
  audioHint: AudioHintCode | null;
  metrics: PipelineMetrics | null;
}

export async function logInteraction(log: InteractionLog): Promise<void> {
  await pool.execute(
    `INSERT INTO users (device_id) VALUES (?)
     ON DUPLICATE KEY UPDATE last_seen_at = CURRENT_TIMESTAMP`,
    [log.deviceId]
  );

  const [rows] = await pool.execute<any[]>(
    'SELECT id FROM users WHERE device_id = ?',
    [log.deviceId]
  );
  const userId: number = rows[0].id;

  await pool.execute(
    `INSERT INTO interactions (
      user_id, scenario_id,
      native_language, target_language, immersion_level,
      source_text, ai_response_text,
      success, audio_hint_code,
      stt_latency_ms, ai_latency_ms,
      tts_latency_ms, total_latency_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      log.scenarioId,
      log.nativeLanguage,
      log.targetLanguage,
      log.immersionLevel,
      log.sourceText,
      log.aiResponseText,
      log.success ? 1 : 0,
      log.audioHint,
      log.metrics?.sttLatencyMs ?? null,
      log.metrics?.aiLatencyMs ?? null,
      log.metrics?.ttsLatencyMs ?? null,
      log.metrics?.totalLatencyMs ?? null,
    ]
  );

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
