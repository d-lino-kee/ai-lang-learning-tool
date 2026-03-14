import { Request, Response, NextFunction } from 'express';
import { runS2SPipeline } from '../pipeline/s2s.pipeline';
import { logInteraction } from '../db/interactions.db';
import { getHistory, getImmersionLevel, appendToHistory, clearHistory } from '../ai/history.store';
import { generateBlobIntro } from '../ai/conversation.ai';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { S2SRequest, SupportedLanguage } from '../types';

const ttsClient = new TextToSpeechClient();

const TTS_VOICE_MAP: Record<SupportedLanguage, { languageCode: string; name: string }> = {
  'en-US': { languageCode: 'en-US', name: 'en-US-Neural2-F' },
  'fr-FR': { languageCode: 'fr-FR', name: 'fr-FR-Neural2-A' },
  'es-ES': { languageCode: 'es-ES', name: 'es-ES-Neural2-A' },
  'ar-SA': { languageCode: 'ar-XA', name: 'ar-XA-Wavenet-A' },
  'pt-BR': { languageCode: 'pt-BR', name: 'pt-BR-Neural2-A' },
};

// ── POST /api/s2s/translate ───────────────────────────────────────────────────
export async function translateHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const body = req.body as S2SRequest;

  if (!body.audioBase64 || !body.deviceId) {
    res.status(400).json({
      success: false,
      audioHint: 'ERR_INTERNAL',
      message: 'Missing required fields: audioBase64, deviceId',
    });
    return;
  }

  if (body.audioBase64.length > 5_000_000) {
    res.status(413).json({
      success: false,
      audioHint: 'ERR_AUDIO_TOO_LONG',
      message: 'Audio exceeds the 60-second limit',
    });
    return;
  }

  try {
    // Use the stored immersion level if the client didn't send one explicitly
    const storedImmersion = getImmersionLevel(body.deviceId, body.scenarioId);
    const immersionLevel = body.immersionLevel ?? storedImmersion;

    const conversationHistory = getHistory(body.deviceId, body.scenarioId);

    const result = await runS2SPipeline({
      ...body,
      immersionLevel,
      conversationHistory,
    });

    if (result.success) {
      // Append exchange and let the store auto-advance immersion level
      appendToHistory(
        body.deviceId,
        result.sourceText,
        result.aiResponseText,
        body.scenarioId
      );
    }

    // Non-blocking DB log
    setImmediate(() => {
      logInteraction({
        deviceId: body.deviceId,
        scenarioId: body.scenarioId ?? null,
        nativeLanguage: body.nativeLanguage,
        targetLanguage: body.targetLanguage,
        immersionLevel,
        success: result.success,
        sourceText: result.success ? result.sourceText : null,
        aiResponseText: result.success ? result.aiResponseText : null,
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

// ── GET /api/s2s/intro ────────────────────────────────────────────────────────
// Called by the frontend when the app first loads. Returns the Blob's
// opening spoken message in the user's native language, explaining the app.
export async function blobIntroHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  const nativeLanguage = (req.query.nativeLanguage as SupportedLanguage) ?? 'en-US';
  const targetLanguage = (req.query.targetLanguage as SupportedLanguage) ?? 'fr-FR';

  try {
    const introText = await generateBlobIntro(nativeLanguage, targetLanguage);

    // Synthesize the intro to audio
    const voice = TTS_VOICE_MAP[nativeLanguage];
    const [ttsResponse] = await ttsClient.synthesizeSpeech({
      input: { text: introText },
      voice: { languageCode: voice.languageCode, name: voice.name },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 0.85 },
    });

    const audioBase64 = Buffer.from(
      ttsResponse.audioContent as Uint8Array
    ).toString('base64');

    res.status(200).json({
      success: true,
      introText,
      audioBase64,
    });
  } catch (err) {
    next(err);
  }
}

// ── DELETE /api/s2s/history ───────────────────────────────────────────────────
export function clearHistoryHandler(req: Request, res: Response): void {
  const deviceId = res.locals.deviceId as string;
  const scenarioId = req.query.scenarioId
    ? parseInt(req.query.scenarioId as string, 10)
    : undefined;

  clearHistory(deviceId, scenarioId);
  res.status(200).json({ success: true, message: 'Conversation history cleared' });
}

// ── GET /api/s2s/mock ─────────────────────────────────────────────────────────
export function mockTranslateHandler(_req: Request, res: Response): void {
  res.status(200).json({
    success: true,
    audioBase64:
      'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhADMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzM',
    sourceText: '[mock] Hello, I would like to apply for the job.',
    aiResponseText: '[mock] That is great! In French we say "Bonjour". That means hello!',
    immersionLevel: 10,
    metrics: {
      sttLatencyMs: 320,
      aiLatencyMs: 540,
      ttsLatencyMs: 430,
      totalLatencyMs: 1290,
      sourceTextLength: 44,
    },
  });
}
