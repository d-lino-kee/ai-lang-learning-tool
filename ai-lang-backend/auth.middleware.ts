import { Request, Response, NextFunction } from 'express';

// Device ID rules:
// - Must be present in the x-device-id header
// - 8–128 alphanumeric characters, hyphens, or underscores
// - Prevents injection attacks and garbage fingerprints
const DEVICE_ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const deviceId = req.headers['x-device-id'];

  if (!deviceId || typeof deviceId !== 'string') {
    res.status(401).json({
      success: false,
      audioHint: 'ERR_INTERNAL',
      message: 'Missing x-device-id header',
    });
    return;
  }

  if (!DEVICE_ID_PATTERN.test(deviceId)) {
    res.status(401).json({
      success: false,
      audioHint: 'ERR_INTERNAL',
      message: 'Invalid device ID format',
    });
    return;
  }

  // Attach to request so downstream handlers don't need to re-read the header
  res.locals.deviceId = deviceId;
  next();
}

// ── WebSocket equivalent ──────────────────────────────────────────────────────
// WS connections can't use Express middleware, so this helper is called
// directly inside s2s.ws.ts when the config frame arrives.
export function validateWsDeviceId(deviceId: unknown): deviceId is string {
  return (
    typeof deviceId === 'string' &&
    DEVICE_ID_PATTERN.test(deviceId)
  );
}
