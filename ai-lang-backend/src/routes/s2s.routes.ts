import { Router } from 'express';
import {
  translateHandler,
  mockTranslateHandler,
  clearHistoryHandler,
  blobIntroHandler,
} from '../controllers/s2s.controller';
import { validateS2SRequest } from '../middleware/validate.middleware';

export const s2sRouter = Router();

// Blob opening message — called on first app load
s2sRouter.get('/intro', blobIntroHandler);

// Real pipeline
s2sRouter.post('/translate', validateS2SRequest, translateHandler);

// Clear conversation history
s2sRouter.delete('/history', clearHistoryHandler);

// Mock endpoint for Engineer A
s2sRouter.get('/mock', mockTranslateHandler);
