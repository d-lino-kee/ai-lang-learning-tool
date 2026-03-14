import { Request, Response, NextFunction } from 'express';
import { S2SRequest, SupportedLanguage } from '../types';

const SUPPORTED_LANGUAGES: SupportedLanguage[] = ['en-US', 'fr-FR', 'es-ES', 'ar-SA', 'pt-BR'];
const SUPPORTED_MIME_TYPES = ['audio/webm', 'audio/wav', 'audio/ogg'];
const VALID_IMMERSION_LEVELS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

export function validateS2SRequest(req: Request, res: Response, next: NextFunction): void {
  const body = req.body as Partial<S2SRequest>;
  const errors: string[] = [];

  if (!body.audioBase64) errors.push('audioBase64 is required');
  if (!body.deviceId) errors.push('deviceId is required');

  if (!body.nativeLanguage || !SUPPORTED_LANGUAGES.includes(body.nativeLanguage)) {
    errors.push(`nativeLanguage must be one of: ${SUPPORTED_LANGUAGES.join(', ')}`);
  }

  if (!body.targetLanguage || !SUPPORTED_LANGUAGES.includes(body.targetLanguage)) {
    errors.push(`targetLanguage must be one of: ${SUPPORTED_LANGUAGES.join(', ')}`);
  }

  if (body.nativeLanguage === body.targetLanguage) {
    errors.push('nativeLanguage and targetLanguage must differ');
  }

  if (!body.audioMimeType || !SUPPORTED_MIME_TYPES.includes(body.audioMimeType)) {
    errors.push(`audioMimeType must be one of: ${SUPPORTED_MIME_TYPES.join(', ')}`);
  }

  if (
    body.immersionLevel !== undefined &&
    !VALID_IMMERSION_LEVELS.includes(body.immersionLevel)
  ) {
    errors.push(`immersionLevel must be one of: ${VALID_IMMERSION_LEVELS.join(', ')}`);
  }

  if (errors.length) {
    res.status(400).json({
      success: false,
      audioHint: 'ERR_INTERNAL',
      message: errors.join('; '),
    });
    return;
  }

  next();
}
