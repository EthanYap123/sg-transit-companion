import { createHash, timingSafeEqual } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { SyncInProgressError, type StopSyncService } from '../stops/stop-sync.js';

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** Bearer CRON_SECRET check. With no secret configured, internal routes are closed. */
export function requireCronSecret(secret: string): RequestHandler {
  const expected = sha256(secret);
  return (req, res, next) => {
    const header = req.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    if (!secret || !token || !timingSafeEqual(sha256(token), expected)) {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Missing or invalid token' } });
      return;
    }
    next();
  };
}

export function internalRouter(options: {
  cronSecret: string;
  stopSync: StopSyncService;
  onError?: (err: unknown, context: string) => void;
}): Router {
  const router = Router();
  const onError = options.onError ?? (() => undefined);
  router.use(requireCronSecret(options.cronSecret));

  router.post('/stops/sync', async (_req, res, next) => {
    try {
      const { runId, done } = await options.stopSync.start();
      done.catch((err: unknown) => onError(err, `stop sync ${runId}`));
      res.status(202).json({ runId });
    } catch (err) {
      if (err instanceof SyncInProgressError) {
        res.status(409).json({ error: { code: 'CONFLICT', message: err.message } });
        return;
      }
      next(err);
    }
  });

  return router;
}
