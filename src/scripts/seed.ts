// ═══════════════════════════════════════════════════════════════════
//  Seed Script — Populates scenarios and prompts
//  Usage: npm run seed
// ═══════════════════════════════════════════════════════════════════

import { pool, closePool } from "../config/database.js";

const SCENARIOS = [
  { slug: "job_application", icon: "💼", color: "#1D9E75", order: 1 },
  { slug: "doctor_appointment", icon: "🏥", color: "#534AB7", order: 2 },
  { slug: "everyday_language", icon: "🗣️", color: "#D85A30", order: 3 },
  { slug: "custom_help", icon: "❓", color: "#BA7517", order: 4 },
];

const PROMPTS: Record<string, string> = {
  job_application:
    "Practice talking about your skills and experience for a job interview.",
  doctor_appointment:
    "Learn how to describe symptoms and understand your doctor.",
  everyday_language:
    "Practice everyday phrases like greetings, directions, and shopping.",
  custom_help:
    "Ask me anything. I will help you say it in another language.",
};

async function seed() {
  console.log("Seeding database...");

  try {
    for (const s of SCENARIOS) {
      // Upsert scenario
      await pool.execute(
        `INSERT INTO scenarios (slug, icon_emoji, color_hex, sort_order)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           icon_emoji = VALUES(icon_emoji),
           color_hex = VALUES(color_hex),
           sort_order = VALUES(sort_order)`,
        [s.slug, s.icon, s.color, s.order]
      );

      // Get scenario ID
      const [rows] = await pool.execute<any[]>(
        "SELECT id FROM scenarios WHERE slug = ?",
        [s.slug]
      );
      const scenarioId = rows[0]?.id;
      if (!scenarioId) continue;

      // Upsert prompt
      const promptText = PROMPTS[s.slug];
      if (promptText) {
        // Delete existing prompts for this scenario/language
        await pool.execute(
          "DELETE FROM scenario_prompts WHERE scenario_id = ? AND language = ?",
          [scenarioId, "en"]
        );
        await pool.execute(
          `INSERT INTO scenario_prompts (scenario_id, language, prompt_text, sort_order)
           VALUES (?, 'en', ?, 1)`,
          [scenarioId, promptText]
        );
      }
    }

    console.log("Seeded 4 scenarios with English prompts.");
  } catch (err) {
    console.error("Seed failed:", err);
    process.exit(1);
  } finally {
    await closePool();
  }
}

seed();
