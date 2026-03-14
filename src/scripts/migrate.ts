// ═══════════════════════════════════════════════════════════════════
//  Database Migration — Up / Down
//  Usage:  npm run migrate          (applies migration)
//          npm run migrate -- --down (rolls back migration)
// ═══════════════════════════════════════════════════════════════════

import { pool, closePool } from "../config/database.js";

const UP = `
-- Users
CREATE TABLE IF NOT EXISTS users (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    device_id       VARCHAR(255) NOT NULL UNIQUE,
    display_name    VARCHAR(100) DEFAULT NULL,
    native_language VARCHAR(10)  NOT NULL DEFAULT 'en',
    target_language VARCHAR(10)  NOT NULL DEFAULT 'fr',
    speech_rate     DECIMAL(3,2) NOT NULL DEFAULT 0.85,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_active_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_device (device_id),
    INDEX idx_last_active (last_active_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Scenarios
CREATE TABLE IF NOT EXISTS scenarios (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    slug        VARCHAR(50)  NOT NULL UNIQUE,
    icon_emoji  VARCHAR(10)  NOT NULL,
    color_hex   CHAR(7)      NOT NULL,
    sort_order  TINYINT UNSIGNED NOT NULL DEFAULT 0,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_active_sort (is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Scenario prompts
CREATE TABLE IF NOT EXISTS scenario_prompts (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    scenario_id INT UNSIGNED NOT NULL,
    language    VARCHAR(10)  NOT NULL,
    prompt_text TEXT         NOT NULL,
    sort_order  TINYINT UNSIGNED NOT NULL DEFAULT 0,
    FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE,
    INDEX idx_scenario_lang (scenario_id, language)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User sessions
CREATE TABLE IF NOT EXISTS user_sessions (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id             INT UNSIGNED NOT NULL,
    scenario_id         INT UNSIGNED DEFAULT NULL,
    started_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at            TIMESTAMP    NULL DEFAULT NULL,
    interaction_count   INT UNSIGNED NOT NULL DEFAULT 0,
    last_interaction_at TIMESTAMP    NULL DEFAULT NULL,
    duration_seconds    INT UNSIGNED GENERATED ALWAYS AS (
        CASE WHEN ended_at IS NOT NULL
             THEN TIMESTAMPDIFF(SECOND, started_at, ended_at)
             ELSE NULL
        END
    ) STORED,
    FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE SET NULL,
    INDEX idx_user_sessions (user_id, started_at DESC),
    INDEX idx_scenario_sessions (scenario_id, started_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Interactions
CREATE TABLE IF NOT EXISTS interactions (
    id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    session_id            INT UNSIGNED NOT NULL,
    original_text         TEXT         NOT NULL,
    translated_text       TEXT         NOT NULL,
    source_language       VARCHAR(10)  NOT NULL,
    target_language       VARCHAR(10)  NOT NULL,
    confidence_score      DECIMAL(5,4) NOT NULL,
    stt_duration_ms       INT UNSIGNED NOT NULL,
    translate_duration_ms INT UNSIGNED NOT NULL,
    tts_duration_ms       INT UNSIGNED NOT NULL,
    total_duration_ms     INT UNSIGNED NOT NULL,
    user_rating           TINYINT UNSIGNED DEFAULT NULL,
    created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES user_sessions(id) ON DELETE CASCADE,
    INDEX idx_session_interactions (session_id, created_at),
    INDEX idx_confidence (confidence_score),
    INDEX idx_performance (total_duration_ms)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Scenario progress
CREATE TABLE IF NOT EXISTS scenario_progress (
    id                       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id                  INT UNSIGNED NOT NULL,
    scenario_id              INT UNSIGNED NOT NULL,
    interactions_completed   INT UNSIGNED NOT NULL DEFAULT 0,
    mastery_score            DECIMAL(5,2) DEFAULT NULL,
    last_practiced_at        TIMESTAMP    NULL DEFAULT NULL,
    first_practiced_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_scenario (user_id, scenario_id),
    FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE,
    INDEX idx_progress (user_id, mastery_score DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Views
CREATE OR REPLACE VIEW v_user_summary AS
SELECT
    u.id AS user_id,
    u.device_id,
    u.target_language,
    COUNT(DISTINCT us.id) AS total_sessions,
    COALESCE(SUM(us.interaction_count), 0) AS total_interactions,
    AVG(i.confidence_score) AS avg_confidence,
    AVG(i.total_duration_ms) AS avg_response_ms,
    MAX(us.started_at) AS last_session
FROM users u
LEFT JOIN user_sessions us ON u.id = us.user_id
LEFT JOIN interactions i ON us.id = i.session_id
GROUP BY u.id;

CREATE OR REPLACE VIEW v_scenario_leaderboard AS
SELECT
    s.slug AS scenario,
    s.icon_emoji,
    sp.user_id,
    sp.interactions_completed,
    sp.mastery_score,
    sp.last_practiced_at
FROM scenario_progress sp
JOIN scenarios s ON sp.scenario_id = s.id
ORDER BY sp.mastery_score DESC;
`;

const DOWN = `
DROP VIEW IF EXISTS v_scenario_leaderboard;
DROP VIEW IF EXISTS v_user_summary;
DROP TABLE IF EXISTS scenario_progress;
DROP TABLE IF EXISTS interactions;
DROP TABLE IF EXISTS user_sessions;
DROP TABLE IF EXISTS scenario_prompts;
DROP TABLE IF EXISTS scenarios;
DROP TABLE IF EXISTS users;
`;

async function run() {
  const isDown = process.argv.includes("--down");
  const sql = isDown ? DOWN : UP;
  const label = isDown ? "Rolling back" : "Applying";

  console.log(`${label} migration...`);

  try {
    // Split on semicolons but filter empty statements
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      await pool.execute(stmt);
    }

    console.log(`Migration ${isDown ? "rolled back" : "applied"} successfully.`);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await closePool();
  }
}

run();
