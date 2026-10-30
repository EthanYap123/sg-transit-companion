import { Router } from 'express';
import type { Config } from '../config.js';

export function healthRouter(config: Config): Router {
  const router = Router();
  const startedAt = Date.now();

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: config.APP_VERSION,
      commit: config.GIT_COMMIT,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    });
  });

  return router;
}
