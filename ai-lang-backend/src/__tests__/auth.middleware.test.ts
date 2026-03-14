import request from 'supertest';
import express from 'express';
import { json } from 'body-parser';
import { authMiddleware, validateWsDeviceId } from '../middleware/auth.middleware';

const app = express();
app.use(json());
app.get('/test', authMiddleware, (_req, res) => res.status(200).json({ ok: true }));

// ─────────────────────────────────────────────────────────────────────────────
describe('authMiddleware (REST)', () => {
  it('passes a valid device ID through', async () => {
    const res = await request(app)
      .get('/test')
      .set('x-device-id', 'device-abc-12345678');
    expect(res.status).toBe(200);
  });

  it('rejects a missing x-device-id header', async () => {
    const res = await request(app).get('/test');
    expect(res.status).toBe(401);
    expect(res.body.audioHint).toBe('ERR_INTERNAL');
  });

  it('rejects a device ID that is too short (under 8 chars)', async () => {
    const res = await request(app).get('/test').set('x-device-id', 'abc');
    expect(res.status).toBe(401);
  });

  it('rejects a device ID that is too long (over 128 chars)', async () => {
    const res = await request(app).get('/test').set('x-device-id', 'a'.repeat(129));
    expect(res.status).toBe(401);
  });

  it('rejects a device ID with special characters', async () => {
    const res = await request(app).get('/test').set('x-device-id', 'device<script>xss');
    expect(res.status).toBe(401);
  });

  it('attaches deviceId to res.locals for downstream handlers', async () => {
    const testApp = express();
    testApp.get('/check', authMiddleware, (_req, res) => {
      res.status(200).json({ deviceId: res.locals.deviceId });
    });

    const res = await request(testApp)
      .get('/check')
      .set('x-device-id', 'valid-device-id-001');

    expect(res.status).toBe(200);
    expect(res.body.deviceId).toBe('valid-device-id-001');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('validateWsDeviceId (WebSocket)', () => {
  it('returns true for a valid device ID', () => {
    expect(validateWsDeviceId('valid-device-001')).toBe(true);
  });

  it('returns false for undefined', () => {
    expect(validateWsDeviceId(undefined)).toBe(false);
  });

  it('returns false for a number', () => {
    expect(validateWsDeviceId(12345678)).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(validateWsDeviceId('')).toBe(false);
  });

  it('returns false for a string with spaces', () => {
    expect(validateWsDeviceId('device id with spaces')).toBe(false);
  });

  it('returns false for a string under 8 characters', () => {
    expect(validateWsDeviceId('abc')).toBe(false);
  });

  it('returns true for a 128-character ID (boundary)', () => {
    expect(validateWsDeviceId('a'.repeat(128))).toBe(true);
  });

  it('returns false for a 129-character ID (over boundary)', () => {
    expect(validateWsDeviceId('a'.repeat(129))).toBe(false);
  });
});
