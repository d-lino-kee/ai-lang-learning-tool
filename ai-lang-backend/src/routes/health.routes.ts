import { Router, Request, Response } from 'express';
import { testConnection } from '../db/connection';

export const healthRouter = Router();

healthRouter.get('/', async (_req: Request, res: Response) => {
  const dbOk = await testConnection().catch(() => false);
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'degraded',
    db: dbOk ? 'connected' : 'unreachable',
    timestamp: new Date().toISOString(),
  });
});
