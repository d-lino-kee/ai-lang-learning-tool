import { runS2SPipeline } from '../pipeline/s2s.pipeline';
import { S2SRequest } from '../types';

// ── Mock all three Google Cloud clients ───────────────────────────────────────
jest.mock('@google-cloud/speech', () => ({
  SpeechClient: jest.fn().mockImplementation(() => ({
    recognize: jest.fn().mockResolvedValue([{
      results: [{ alternatives: [{ transcript: 'Hello I would like to apply for the job', confidence: 0.95 }] }],
    }]),
  })),
}));

jest.mock('@google-cloud/translate', () => ({
  TranslationServiceClient: jest.fn().mockImplementation(() => ({
    translateText: jest.fn().mockResolvedValue([{
      translations: [{ translatedText: 'Bonjour je voudrais postuler pour le poste' }],
    }]),
  })),
}));

jest.mock('@google-cloud/text-to-speech', () => ({
  TextToSpeechClient: jest.fn().mockImplementation(() => ({
    synthesizeSpeech: jest.fn().mockResolvedValue([{
      audioContent: Buffer.from('fake-mp3-bytes'),
    }]),
  })),
}));

// ── Base request fixture ──────────────────────────────────────────────────────
const baseRequest: S2SRequest = {
  audioBase64: Buffer.from('fake-audio').toString('base64'),
  audioMimeType: 'audio/webm',
  sourceLanguage: 'en-US',
  targetLanguage: 'fr-FR',
  scenarioId: 1,
  deviceId: 'test-device-001',
};

// ─────────────────────────────────────────────────────────────────────────────
describe('S2S Pipeline', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns success with audioBase64 and metrics on happy path', async () => {
    const result = await runS2SPipeline(baseRequest);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.audioBase64).toBeTruthy();
    expect(result.sourceText).toBe('Hello I would like to apply for the job');
    expect(result.translatedText).toBe('Bonjour je voudrais postuler pour le poste');
    expect(result.metrics.totalLatencyMs).toBeGreaterThanOrEqual(0);
    expect(result.metrics.sttLatencyMs).toBeGreaterThanOrEqual(0);
    expect(result.metrics.translationLatencyMs).toBeGreaterThanOrEqual(0);
    expect(result.metrics.ttsLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it('returns ERR_NO_SPEECH when STT returns empty results', async () => {
    const { SpeechClient } = require('@google-cloud/speech');
    SpeechClient.mockImplementation(() => ({
      recognize: jest.fn().mockResolvedValue([{ results: [] }]),
    }));

    const result = await runS2SPipeline(baseRequest);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.audioHint).toBe('ERR_NO_SPEECH');
  });

  it('returns ERR_NO_SPEECH when STT throws', async () => {
    const { SpeechClient } = require('@google-cloud/speech');
    SpeechClient.mockImplementation(() => ({
      recognize: jest.fn().mockRejectedValue(new Error('STT quota exceeded')),
    }));

    const result = await runS2SPipeline(baseRequest);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.audioHint).toBe('ERR_NO_SPEECH');
  });

  it('returns ERR_TRANSLATION_FAIL when translation throws', async () => {
    const { TranslationServiceClient } = require('@google-cloud/translate');
    TranslationServiceClient.mockImplementation(() => ({
      translateText: jest.fn().mockRejectedValue(new Error('Translation API error')),
    }));

    const result = await runS2SPipeline(baseRequest);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.audioHint).toBe('ERR_TRANSLATION_FAIL');
  });

  it('returns ERR_TTS_FAIL when TTS throws', async () => {
    const { TextToSpeechClient } = require('@google-cloud/text-to-speech');
    TextToSpeechClient.mockImplementation(() => ({
      synthesizeSpeech: jest.fn().mockRejectedValue(new Error('TTS quota exceeded')),
    }));

    const result = await runS2SPipeline(baseRequest);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.audioHint).toBe('ERR_TTS_FAIL');
  });

  it('populates sourceTextLength in metrics', async () => {
    const result = await runS2SPipeline(baseRequest);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.metrics.sourceTextLength).toBe(
      'Hello I would like to apply for the job'.length
    );
  });

  it('works without an optional scenarioId', async () => {
    const req = { ...baseRequest, scenarioId: undefined };
    const result = await runS2SPipeline(req);
    expect(result.success).toBe(true);
  });
});
