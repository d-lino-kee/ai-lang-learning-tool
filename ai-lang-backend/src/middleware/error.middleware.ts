import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

// ── Rate limiter ──────────────────────────────────────────────────────────────
// Audio transcription is expensive — cap at 30 requests/minute per IP
export const rateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      audioHint: 'ERR_RATE_LIMITED',
      message: 'Too many requests — please wait before trying again',
    });
  },
});

// ── Global error handler ──────────────────────────────────────────────────────
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('[error]', err.message, err.stack);
  res.status(500).json({
    success: false,
    audioHint: 'ERR_INTERNAL',
    message: 'An unexpected error occurred',
  });
}

// ── Request logger ────────────────────────────────────────────────────────────
export function requestLogger(req: Request, _res: Response, next: NextFunction): void {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
}
