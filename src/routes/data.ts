// ═══════════════════════════════════════════════════════════════════
//  Data Routes — Progress, Scenarios, User preferences
//  All require authentication.
// ═══════════════════════════════════════════════════════════════════

import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import * as dal from "../dal/index.js";

export const dataRouter = Router();

// All routes require auth
dataRouter.use(requireAuth);

// ─── Scenarios ───

/**
 * GET /api/data/scenarios
 * Returns all active scenarios with user's progress.
 */
dataRouter.get("/scenarios", async (req: Request, res: Response) => {
  try {
    const [scenarios, userProgress] = await Promise.all([
      dal.progress.getActiveScenarios(),
      dal.progress.getUserProgress(req.userId!),
    ]);

    // Merge scenarios with progress
    const result = scenarios.map((s) => {
      const progress = userProgress.find((p) => p.scenarioId === s.id);
      return {
        ...s,
        progress: progress
          ? {
              interactionsCompleted: progress.interactionsCompleted,
              masteryScore: progress.masteryScore,
              lastPracticedAt: progress.lastPracticedAt,
            }
          : null,
      };
    });

    res.json(result);
  } catch (err: any) {
    console.error("Scenarios error:", err);
    res.status(500).json({ error: "FETCH_FAILED", audioHint: "something_wrong" });
  }
});

/**
 * GET /api/data/scenarios/:id/prompts
 * Returns audio prompts for a scenario.
 */
dataRouter.get("/scenarios/:id/prompts", async (req: Request, res: Response) => {
  try {
    const scenarioId = parseInt(req.params.id, 10);
    const lang = (req.query.lang as string) || "en";
    const prompts = await dal.progress.getScenarioPrompts(scenarioId, lang);
    res.json({ prompts });
  } catch (err: any) {
    res.status(500).json({ error: "FETCH_FAILED", audioHint: "something_wrong" });
  }
});

// ─── Sessions ───

/**
 * POST /api/data/sessions
 * Start a new practice session.
 */
dataRouter.post("/sessions", async (req: Request, res: Response) => {
  try {
    const { scenarioId } = req.body;
    const sessionId = await dal.sessions.createSession(req.userId!, scenarioId);
    res.status(201).json({ sessionId });
  } catch (err: any) {
    res.status(500).json({ error: "SESSION_CREATE_FAILED", audioHint: "something_wrong" });
  }
});

/**
 * PATCH /api/data/sessions/:id/end
 * End a session.
 */
dataRouter.patch("/sessions/:id/end", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    await dal.sessions.endSession(sessionId);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: "SESSION_END_FAILED", audioHint: "something_wrong" });
  }
});

/**
 * GET /api/data/sessions
 * Get session history.
 */
dataRouter.get("/sessions", async (req: Request, res: Response) => {
  try {
    const limit = parseInt((req.query.limit as string) || "20", 10);
    const offset = parseInt((req.query.offset as string) || "0", 10);
    const sessions = await dal.sessions.getSessionHistory(req.userId!, limit, offset);
    res.json(sessions);
  } catch (err: any) {
    res.status(500).json({ error: "FETCH_FAILED", audioHint: "something_wrong" });
  }
});

// ─── User ───

/**
 * GET /api/data/me
 * Get current user info + summary stats.
 */
dataRouter.get("/me", async (req: Request, res: Response) => {
  try {
    const [user, summary] = await Promise.all([
      dal.users.findById(req.userId!),
      dal.users.getUserSummary(req.userId!),
    ]);
    if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });
    res.json({ user, summary });
  } catch (err: any) {
    res.status(500).json({ error: "FETCH_FAILED", audioHint: "something_wrong" });
  }
});

/**
 * PATCH /api/data/me
 * Update user preferences (target language, speech rate, display name).
 */
dataRouter.patch("/me", async (req: Request, res: Response) => {
  try {
    const { targetLanguage, speechRate, displayName } = req.body;
    await dal.users.updatePreferences(req.userId!, {
      targetLanguage,
      speechRate,
      displayName,
    });
    const user = await dal.users.findById(req.userId!);
    res.json(user);
  } catch (err: any) {
    res.status(500).json({ error: "UPDATE_FAILED", audioHint: "something_wrong" });
  }
});

// ─── Interactions ───

/**
 * POST /api/data/interactions/:id/rate
 * Rate an interaction (thumbs up = 2, thumbs down = 1).
 */
dataRouter.post("/interactions/:id/rate", async (req: Request, res: Response) => {
  try {
    const interactionId = parseInt(req.params.id, 10);
    const { rating } = req.body;
    if (rating !== 1 && rating !== 2) {
      return res.status(400).json({ error: "INVALID_RATING" });
    }
    await dal.interactions.rateInteraction(interactionId, rating);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: "RATE_FAILED", audioHint: "something_wrong" });
  }
});
