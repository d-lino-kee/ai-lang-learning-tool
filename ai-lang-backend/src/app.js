const express = require("express");
const cors = require("cors");
const { transcribe } = require("./sttService");
const { synthesise } = require("./ttsService");
const { generateReply, clearSession } = require("./llmService");

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
  })
);

// ─── Health check ─────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ─── Greeting ─────────────────────────────────────────────────────────────────

/**
 * POST /api/greeting
 * Returns synthesised MP3 of Sophie's opening greeting.
 */
app.post("/api/greeting", async (_req, res) => {
  const text =
    "Bonjour! That means hello in French! I am Sophie, your French language tutor. " +
    "We are going to learn some French together today. " +
    "First, what is your name? " +
    "Press the microphone button to say your name, " +
    "then press it again when you are finished.";

  try {
    const audio = await synthesise(text);
    res.set("Content-Type", "audio/mpeg");
    res.send(audio);
  } catch (err) {
    console.error("[/api/greeting]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Transcribe name + respond ────────────────────────────────────────────────

/**
 * POST /api/transcribe
 * Headers: X-Session-Id (string)
 * Accepts raw audio. Runs STT, generates a Gemini reply, returns MP3.
 */
app.post(
  "/api/transcribe",
  express.raw({ type: "*/*", limit: "10mb" }),
  async (req, res) => {
    const mimeType = req.headers["content-type"] || "audio/webm";
    const sessionId = req.headers["x-session-id"] || "default";

    let transcript = "";
    let language = "fr-FR";
    try {
      ({ transcript, language } = await transcribe(req.body, mimeType));
      console.log("[STT] Heard:", transcript || "(nothing)", "| lang:", language);
    } catch (err) {
      console.error("[STT] Error:", err.message);
    }

    // Give Gemini the context that this is the name-capture step
    const nameContext = transcript
      ? `The user just told me their name. They said: "${transcript}". Greet them warmly using their name, tell them enchanté (and what it means), then invite them to choose a scenario by tapping one of the pictures on screen.`
      : "The user did not say anything or I could not hear them. Kindly let them know and encourage them to try saying their name again into the microphone.";

    let replyText = "";
    try {
      replyText = await generateReply({
        sessionId,
        scenario: null,
        userSaid: nameContext,
        language,
      });
    } catch (err) {
      console.error("[LLM] Error:", err.message);
      replyText = transcript
        ? `Enchanté, ${transcript}! That means nice to meet you in French. Now choose a picture to start practising!`
        : "Je n'ai pas compris. Please try saying your name again!";
    }

    try {
      const audio = await synthesise(replyText);
      res.set("Content-Type", "audio/mpeg");
      res.send(audio);
    } catch (err) {
      console.error("[TTS] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

// ─── Scenario intro ───────────────────────────────────────────────────────────

/**
 * POST /api/scenario-intro
 * Body (JSON): { scenario: "everyday" | "restaurant" | "directions" }
 * Headers: X-Session-Id
 * Returns synthesised MP3 introducing the chosen scenario via Gemini.
 */
app.post("/api/scenario-intro", express.json(), async (req, res) => {
  const scenario = req.body?.scenario ?? "everyday";
  const sessionId = req.headers["x-session-id"] || "default";

  // Clear history so each scenario starts fresh
  clearSession(sessionId + "-" + scenario);

  const prompts = {
    everyday: "The user just chose the everyday conversation scenario. Give a short, enthusiastic intro (2-3 sentences). Set the scene — we just bumped into each other on the street. Tell them to say bonjour to get started.",
    restaurant: "The user just chose the restaurant scenario. Give a short, enthusiastic intro (2-3 sentences). You are their server. Tell them to say bonjour or je voudrais to order something.",
    directions: "The user just chose the directions scenario. Give a short, enthusiastic intro (2-3 sentences). They are lost in Paris and you are a local. Tell them to say pardon or excusez-moi to get your attention.",
  };

  let replyText = "";
  try {
    replyText = await generateReply({
      sessionId: sessionId + "-" + scenario,
      scenario,
      userSaid: prompts[scenario] ?? prompts.everyday,
      language: "en-US",
    });
  } catch (err) {
    console.error("[LLM] Error:", err.message);
    const fallbacks = {
      everyday: "Excellent choix! Let us have an everyday conversation. Imagine we just met on the street. Try saying bonjour to get started!",
      restaurant: "Parfait! I will be your server today. Try saying je voudrais, which means I would like, to order something!",
      directions: "Très bien! You are lost in Paris and I am a local. Say pardon to get my attention!",
    };
    replyText = fallbacks[scenario] ?? fallbacks.everyday;
  }

  try {
    const audio = await synthesise(replyText);
    res.set("Content-Type", "audio/mpeg");
    res.send(audio);
  } catch (err) {
    console.error("[TTS] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Scenario chat ────────────────────────────────────────────────────────────

/**
 * POST /api/scenario-chat
 * Accepts raw audio bytes.
 * Headers:
 *   X-Scenario:   "everyday" | "restaurant" | "directions"
 *   X-Session-Id: unique session string
 *
 * Runs STT → Gemini → TTS, returns MP3.
 */
app.post(
  "/api/scenario-chat",
  express.raw({ type: "*/*", limit: "10mb" }),
  async (req, res) => {
    const scenario = req.headers["x-scenario"] || "everyday";
    const sessionId = (req.headers["x-session-id"] || "default") + "-" + scenario;
    const mimeType = req.headers["content-type"] || "audio/webm";

    let userSaid = "";
    let language = "fr-FR";
    try {
      ({ transcript: userSaid, language } = await transcribe(req.body, mimeType));
      console.log(`[STT][${scenario}] Heard: "${userSaid || "(nothing)"}" | lang: ${language}`);
    } catch (err) {
      console.error("[STT] Error:", err.message);
    }

    let replyText = "";
    try {
      replyText = await generateReply({ sessionId, scenario, userSaid, language });
    } catch (err) {
      console.error("[LLM] Error:", err.message);
      replyText = "Je n'ai pas compris. Could you try saying that again?";
    }

    try {
      const audio = await synthesise(replyText);
      res.set("Content-Type", "audio/mpeg");
      res.send(audio);
    } catch (err) {
      console.error("[TTS] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = app;
