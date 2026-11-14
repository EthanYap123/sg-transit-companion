import { createHash, timingSafeEqual } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { sendError } from '../http/errors.js';
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
      sendError(res, 401, 'UNAUTHENTICATED', 'Missing or invalid token');
      return;
    }
    next();
  };
}

export function internalRouter(options: {
  cronSecret: string;
  stopSync: StopSyncService;
  /** The TRUST_PROXY value, echoed by /client-ip so a deploy can be checked against it. */
  trustProxy?: number;
  onError?: (err: unknown, context: string) => void;
}): Router {
  const router = Router();
  const onError = options.onError ?? (() => undefined);
  router.use(requireCronSecret(options.cronSecret));

  /**
   * Shows how the API reads the caller's address behind the host's proxies, to choose and verify
   * TRUST_PROXY: `ip` is what rate limits use, `forwardedFor` is the raw header the proxies sent.
   */
  router.get('/client-ip', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({
      ip: req.ip ?? null,
      ips: req.ips,
      forwardedFor: req.get('x-forwarded-for') ?? null,
      trustProxy: options.trustProxy ?? 0,
    });
  });

  router.post('/stops/sync', async (_req, res, next) => {
    try {
      const { runId, done } = await options.stopSync.start();
      done.catch((err: unknown) => onError(err, `stop sync ${runId}`));
      res.status(202).json({ runId });
    } catch (err) {
      if (err instanceof SyncInProgressError) {
        sendError(res, 409, 'CONFLICT', err.message);
        return;
      }
      next(err);
    }
  });

  return router;
}
