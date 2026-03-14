import { Request, Response, NextFunction } from 'express';
import { S2SRequest, SupportedLanguage } from '../types';

const SUPPORTED_LANGUAGES: SupportedLanguage[] = ['en-US', 'fr-FR', 'es-ES', 'ar-SA', 'pt-BR'];
const SUPPORTED_MIME_TYPES = ['audio/webm', 'audio/wav', 'audio/ogg'];

export function validateS2SRequest(req: Request, res: Response, next: NextFunction): void {
  const body = req.body as Partial<S2SRequest>;
  const errors: string[] = [];

  if (!body.audioBase64) errors.push('audioBase64 is required');
  if (!body.deviceId) errors.push('deviceId is required');

  if (!body.sourceLanguage || !SUPPORTED_LANGUAGES.includes(body.sourceLanguage)) {
    errors.push(`sourceLanguage must be one of: ${SUPPORTED_LANGUAGES.join(', ')}`);
  }

  if (!body.targetLanguage || !SUPPORTED_LANGUAGES.includes(body.targetLanguage)) {
    errors.push(`targetLanguage must be one of: ${SUPPORTED_LANGUAGES.join(', ')}`);
  }

  if (body.sourceLanguage === body.targetLanguage) {
    errors.push('sourceLanguage and targetLanguage must differ');
  }

  if (!body.audioMimeType || !SUPPORTED_MIME_TYPES.includes(body.audioMimeType)) {
    errors.push(`audioMimeType must be one of: ${SUPPORTED_MIME_TYPES.join(', ')}`);
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
