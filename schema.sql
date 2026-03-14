-- ─────────────────────────────────────────────────────────────────────────────
-- LinguaBlob Database Schema
-- Owned by Engineer C. Backend (Eng B) reads/writes via src/db/interactions.db.ts
-- ─────────────────────────────────────────────────────────────────────────────

CREATE DATABASE IF NOT EXISTS lingua_blob
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE lingua_blob;

-- ── Users (device-based, no accounts) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  device_id     VARCHAR(128)  NOT NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_device_id (device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Scenarios ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scenarios (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  slug        VARCHAR(64)   NOT NULL,
  label_en    VARCHAR(128)  NOT NULL,
  icon_name   VARCHAR(64)   NOT NULL,
  sort_order  TINYINT       NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO scenarios (slug, label_en, icon_name, sort_order) VALUES
  ('job_application',    'Job Application',    'briefcase',     1),
  ('doctor_appointment', 'Doctor Appointment', 'stethoscope',   2),
  ('everyday_language',  'Everyday Language',  'chat-bubbles',  3),
  ('custom',             'Custom / Help',      'question-mark', 4)
ON DUPLICATE KEY UPDATE sort_order = VALUES(sort_order);

-- ── Interactions ──────────────────────────────────────────────────────────────
-- immersion_level tracks how far into the language transition the user was
-- native_language replaces source_language to reflect the app's terminology
CREATE TABLE IF NOT EXISTS interactions (
  id               BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  user_id          INT UNSIGNED      NOT NULL,
  scenario_id      INT UNSIGNED      NULL,
  native_language  VARCHAR(8)        NOT NULL,
  target_language  VARCHAR(8)        NOT NULL,
  immersion_level  TINYINT UNSIGNED  NOT NULL DEFAULT 0,
  source_text      TEXT              NULL,
  ai_response_text TEXT              NULL,
  success          TINYINT(1)        NOT NULL DEFAULT 0,
  audio_hint_code  VARCHAR(32)       NULL,
  stt_latency_ms   SMALLINT UNSIGNED NULL,
  ai_latency_ms    SMALLINT UNSIGNED NULL,
  tts_latency_ms   SMALLINT UNSIGNED NULL,
  total_latency_ms SMALLINT UNSIGNED NULL,
  created_at       DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_user_id (user_id),
  KEY idx_scenario_id (scenario_id),
  KEY idx_created_at (created_at),
  CONSTRAINT fk_interactions_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_interactions_scenario
    FOREIGN KEY (scenario_id) REFERENCES scenarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Scenario progress ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scenario_progress (
  user_id           INT UNSIGNED NOT NULL,
  scenario_id       INT UNSIGNED NOT NULL,
  attempts          INT UNSIGNED NOT NULL DEFAULT 0,
  last_attempted_at DATETIME     NULL,
  PRIMARY KEY (user_id, scenario_id),
  CONSTRAINT fk_progress_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_progress_scenario
    FOREIGN KEY (scenario_id) REFERENCES scenarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Views ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_user_summary AS
SELECT
  u.device_id,
  COUNT(i.id)                         AS total_interactions,
  SUM(i.success)                      AS successful_interactions,
  ROUND(AVG(i.total_latency_ms), 0)   AS avg_latency_ms,
  MAX(i.immersion_level)              AS highest_immersion_reached,
  MAX(i.created_at)                   AS last_active_at
FROM users u
LEFT JOIN interactions i ON i.user_id = u.id
GROUP BY u.id, u.device_id;

CREATE OR REPLACE VIEW v_scenario_stats AS
SELECT
  s.slug,
  s.label_en,
  COUNT(i.id)                    AS total_attempts,
  SUM(i.success)                 AS successful_attempts,
  ROUND(AVG(i.total_latency_ms)) AS avg_latency_ms,
  ROUND(AVG(i.immersion_level))  AS avg_immersion_level
FROM scenarios s
LEFT JOIN interactions i ON i.scenario_id = s.id
GROUP BY s.id, s.slug, s.label_en;
