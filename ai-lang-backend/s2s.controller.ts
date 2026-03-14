import { Request, Response, NextFunction } from 'express';
import { runS2SPipeline } from '../pipeline/s2s.pipeline';
import { logInteraction } from '../db/interactions.db';
import { S2SRequest } from '../types';

// ── POST /api/s2s/translate ───────────────────────────────────────────────────
export async function translateHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const body = req.body as S2SRequest;

  // Basic validation
  if (!body.audioBase64 || !body.deviceId) {
    res.status(400).json({
      success: false,
      audioHint: 'ERR_INTERNAL',
      message: 'Missing required fields: audioBase64, deviceId',
    });
    return;
  }

  // Enforce 60-second audio limit (base64 of 60s @ 16kHz ≈ ~3.8MB)
  if (body.audioBase64.length > 5_000_000) {
    res.status(413).json({
      success: false,
      audioHint: 'ERR_AUDIO_TOO_LONG',
      message: 'Audio exceeds the 60-second limit',
    });
    return;
  }

  try {
    const result = await runS2SPipeline(body);

    // Non-blocking DB log — never let logging delay the response
    setImmediate(() => {
      logInteraction({
        deviceId: body.deviceId,
        scenarioId: body.scenarioId ?? null,
        sourceLanguage: body.sourceLanguage,
        targetLanguage: body.targetLanguage,
        success: result.success,
        sourceText: result.success ? result.sourceText : null,
        translatedText: result.success ? result.translatedText : null,
        audioHint: result.success ? null : result.audioHint,
        metrics: result.success ? result.metrics : null,
      }).catch((err) => console.error('[db] logInteraction failed:', err));
    });

    if (!result.success) {
      res.status(422).json(result);
      return;
    }

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// ── GET /api/s2s/mock ─────────────────────────────────────────────────────────
// Hardcoded response for Engineer A to develop against before the full
// pipeline is ready. Remove once the real pipeline is stable.
export function mockTranslateHandler(_req: Request, res: Response): void {
  res.status(200).json({
    success: true,
    // Tiny silent MP3 in base64 — frontend audio player will play this
    audioBase64:
      'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhADMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzM',
    sourceText: '[mock] Hello, I would like to apply for the job.',
    translatedText: '[mock] Bonjour, je voudrais postuler pour le poste.',
    metrics: {
      sttLatencyMs: 320,
      translationLatencyMs: 110,
      ttsLatencyMs: 430,
      totalLatencyMs: 860,
      sourceTextLength: 44,
    },
  });
}
