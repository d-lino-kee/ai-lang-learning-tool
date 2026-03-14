import { Router } from 'express';
import { translateHandler, mockTranslateHandler } from '../controllers/s2s.controller';
import { validateS2SRequest } from '../middleware/validate.middleware';

export const s2sRouter = Router();

// Real pipeline — requires Google Cloud credentials
s2sRouter.post('/translate', validateS2SRequest, translateHandler);

// Mock endpoint — always works, for frontend development
s2sRouter.get('/mock', mockTranslateHandler);
