import request from 'supertest';
import express from 'express';
import { json } from 'body-parser';
import { s2sRouter } from '../routes/s2s.routes';
import { errorHandler } from '../middleware/error.middleware';
import * as pipeline from '../pipeline/s2s.pipeline';
import * as db from '../db/interactions.db';

// ── Mock pipeline and DB so controller tests are fully isolated ───────────────
jest.mock('../pipeline/s2s.pipeline');
jest.mock('../db/interactions.db', () => ({ logInteraction: jest.fn().mockResolvedValue(undefined) }));

const mockRunPipeline = pipeline.runS2SPipeline as jest.MockedFunction<typeof pipeline.runS2SPipeline>;

// ── Minimal Express app for testing ──────────────────────────────────────────
const app = express();
app.use(json());
app.use('/api/s2s', s2sRouter);
app.use(errorHandler);

// ── Valid request body fixture ────────────────────────────────────────────────
const validBody = {
  audioBase64: Buffer.from('audio').toString('base64'),
  audioMimeType: 'audio/webm',
  sourceLanguage: 'en-US',
  targetLanguage: 'fr-FR',
  scenarioId: 1,
  deviceId: 'test-device-001',
};

const successResult = {
  success: true as const,
  audioBase64: Buffer.from('mp3').toString('base64'),
  sourceText: 'Hello',
  translatedText: 'Bonjour',
  metrics: {
    sttLatencyMs: 100,
    translationLatencyMs: 80,
    ttsLatencyMs: 200,
    totalLatencyMs: 380,
    sourceTextLength: 5,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/s2s/translate', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with audio on success', async () => {
    mockRunPipeline.mockResolvedValue(successResult);

    const res = await request(app).post('/api/s2s/translate').send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.audioBase64).toBeTruthy();
    expect(res.body.metrics).toBeDefined();
  });

  it('returns 400 when audioBase64 is missing', async () => {
    const res = await request(app)
      .post('/api/s2s/translate')
      .send({ ...validBody, audioBase64: undefined });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.audioHint).toBe('ERR_INTERNAL');
  });

  it('returns 400 when deviceId is missing', async () => {
    const res = await request(app)
      .post('/api/s2s/translate')
      .send({ ...validBody, deviceId: undefined });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when sourceLanguage equals targetLanguage', async () => {
    const res = await request(app)
      .post('/api/s2s/translate')
      .send({ ...validBody, targetLanguage: 'en-US' });

    expect(res.status).toBe(400);
    expect(res.body.audioHint).toBe('ERR_INTERNAL');
  });

  it('returns 400 for unsupported audioMimeType', async () => {
    const res = await request(app)
      .post('/api/s2s/translate')
      .send({ ...validBody, audioMimeType: 'audio/mp3' });

    expect(res.status).toBe(400);
  });

  it('returns 413 when audio payload is too large', async () => {
    const bigAudio = 'A'.repeat(5_000_001);
    const res = await request(app)
      .post('/api/s2s/translate')
      .send({ ...validBody, audioBase64: bigAudio });

    expect(res.status).toBe(413);
    expect(res.body.audioHint).toBe('ERR_AUDIO_TOO_LONG');
  });

  it('returns 422 when pipeline returns an error', async () => {
    mockRunPipeline.mockResolvedValue({
      success: false,
      audioHint: 'ERR_NO_SPEECH',
      message: 'No speech detected',
    });

    const res = await request(app).post('/api/s2s/translate').send(validBody);

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.audioHint).toBe('ERR_NO_SPEECH');
  });

  it('returns 500 when pipeline throws unexpectedly', async () => {
    mockRunPipeline.mockRejectedValue(new Error('Unexpected crash'));

    const res = await request(app).post('/api/s2s/translate').send(validBody);

    expect(res.status).toBe(500);
    expect(res.body.audioHint).toBe('ERR_INTERNAL');
  });

  it('does not block response while DB logging', async () => {
    mockRunPipeline.mockResolvedValue(successResult);
    const logSpy = db.logInteraction as jest.MockedFunction<typeof db.logInteraction>;
    // Simulate a slow DB write
    logSpy.mockImplementation(() => new Promise((res) => setTimeout(res, 5000)));

    const start = Date.now();
    const res = await request(app).post('/api/s2s/translate').send(validBody);
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    // Response should come back well before the 5s DB delay
    expect(elapsed).toBeLessThan(1000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/s2s/mock', () => {
  it('returns 200 with a valid response shape', async () => {
    const res = await request(app).get('/api/s2s/mock');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.audioBase64).toBeTruthy();
    expect(res.body.sourceText).toBeTruthy();
    expect(res.body.translatedText).toBeTruthy();
    expect(res.body.metrics).toMatchObject({
      sttLatencyMs: expect.any(Number),
      translationLatencyMs: expect.any(Number),
      ttsLatencyMs: expect.any(Number),
      totalLatencyMs: expect.any(Number),
    });
  });
});
