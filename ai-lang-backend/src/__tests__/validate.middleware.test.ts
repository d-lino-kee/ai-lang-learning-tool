import request from 'supertest';
import express from 'express';
import { json } from 'body-parser';
import { validateS2SRequest } from '../middleware/validate.middleware';

const app = express();
app.use(json());
app.post('/test', validateS2SRequest, (_req, res) => res.status(200).json({ ok: true }));

const valid = {
  audioBase64: 'dGVzdA==',
  audioMimeType: 'audio/webm',
  sourceLanguage: 'en-US',
  targetLanguage: 'fr-FR',
  deviceId: 'abc123',
};

describe('validateS2SRequest middleware', () => {
  it('passes valid request through', async () => {
    const res = await request(app).post('/test').send(valid);
    expect(res.status).toBe(200);
  });

  it('rejects missing audioBase64', async () => {
    const res = await request(app).post('/test').send({ ...valid, audioBase64: undefined });
    expect(res.status).toBe(400);
  });

  it('rejects missing deviceId', async () => {
    const res = await request(app).post('/test').send({ ...valid, deviceId: undefined });
    expect(res.status).toBe(400);
  });

  it('rejects unsupported sourceLanguage', async () => {
    const res = await request(app).post('/test').send({ ...valid, sourceLanguage: 'zz-ZZ' });
    expect(res.status).toBe(400);
  });

  it('rejects unsupported targetLanguage', async () => {
    const res = await request(app).post('/test').send({ ...valid, targetLanguage: 'zz-ZZ' });
    expect(res.status).toBe(400);
  });

  it('rejects when source equals target language', async () => {
    const res = await request(app).post('/test').send({ ...valid, targetLanguage: 'en-US' });
    expect(res.status).toBe(400);
    expect(res.body.audioHint).toBe('ERR_INTERNAL');
  });

  it('rejects unsupported audioMimeType', async () => {
    const res = await request(app).post('/test').send({ ...valid, audioMimeType: 'audio/mp3' });
    expect(res.status).toBe(400);
  });

  it('accepts audio/wav mimeType', async () => {
    const res = await request(app).post('/test').send({ ...valid, audioMimeType: 'audio/wav' });
    expect(res.status).toBe(200);
  });

  it('accepts optional scenarioId', async () => {
    const res = await request(app).post('/test').send({ ...valid, scenarioId: 2 });
    expect(res.status).toBe(200);
  });
});
