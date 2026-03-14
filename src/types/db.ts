// ═══════════════════════════════════════════════════════════════════
//  Database Row Types — direct mapping to MySQL table columns
//  Used internally by DAL; external code uses types/api.ts
// ═══════════════════════════════════════════════════════════════════

import { RowDataPacket } from "mysql2/promise";

export interface UserRow extends RowDataPacket {
  id: number;
  device_id: string;
  display_name: string | null;
  native_language: string;
  target_language: string;
  speech_rate: string;  // DECIMAL comes as string from mysql2
  created_at: Date;
  last_active_at: Date;
}

export interface ScenarioRow extends RowDataPacket {
  id: number;
  slug: string;
  icon_emoji: string;
  color_hex: string;
  sort_order: number;
  is_active: number;  // BOOLEAN comes as 0/1
  created_at: Date;
}

export interface ScenarioPromptRow extends RowDataPacket {
  id: number;
  scenario_id: number;
  language: string;
  prompt_text: string;
  sort_order: number;
}

export interface UserSessionRow extends RowDataPacket {
  id: number;
  user_id: number;
  scenario_id: number | null;
  started_at: Date;
  ended_at: Date | null;
  interaction_count: number;
  last_interaction_at: Date | null;
  duration_seconds: number | null;
}

export interface InteractionRow extends RowDataPacket {
  id: number;
  session_id: number;
  original_text: string;
  translated_text: string;
  source_language: string;
  target_language: string;
  confidence_score: string;  // DECIMAL
  stt_duration_ms: number;
  translate_duration_ms: number;
  tts_duration_ms: number;
  total_duration_ms: number;
  user_rating: number | null;
  created_at: Date;
}

export interface ScenarioProgressRow extends RowDataPacket {
  id: number;
  user_id: number;
  scenario_id: number;
  interactions_completed: number;
  mastery_score: string | null;  // DECIMAL
  last_practiced_at: Date | null;
  first_practiced_at: Date;
}

export interface UserSummaryRow extends RowDataPacket {
  user_id: number;
  device_id: string;
  target_language: string;
  total_sessions: number;
  total_interactions: number;
  avg_confidence: string | null;
  avg_response_ms: string | null;
  last_session: Date | null;
}
