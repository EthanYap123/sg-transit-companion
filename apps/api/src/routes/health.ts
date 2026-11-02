import { Router } from 'express';
import type { CacheStore } from '../cache/store.js';
import type { Config } from '../config.js';
import type { CircuitBreaker } from '../lta/circuit-breaker.js';
import type { StopIndex } from '../stops/stop-index.js';

export interface HealthDeps {
  index?: StopIndex;
  /** Null when Redis is not configured. */
  store?: CacheStore | null;
  ltaBreaker?: CircuitBreaker;
  stopsSyncedAt?: () => string | null;
}

/**
 * Liveness and dependency status for Render, the CD smoke test and the alert pre-wake. It never calls
 * LTA or Postgres, so health checks cannot keep Neon awake. `down` (no stop index) answers 503.
 */
export function healthRouter(config: Config, deps: HealthDeps = {}): Router {
  const router = Router();
  const startedAt = Date.now();

  router.get('/health', async (_req, res) => {
    const base = {
      version: config.APP_VERSION,
      commit: config.GIT_COMMIT,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    };
    if (!deps.index) {
      res.json({ status: 'ok', ...base });
      return;
    }

    const redis = !deps.store ? 'disabled' : (await deps.store.ping()) ? 'ok' : 'down';
    const circuit = deps.ltaBreaker?.state ?? 'closed';
    const indexCount = deps.index.size;
    const status = indexCount === 0 ? 'down' : redis === 'down' || circuit !== 'closed' ? 'degraded' : 'ok';

    res.set('Cache-Control', 'no-store');
    res.status(status === 'down' ? 503 : 200).json({
      status,
      ...base,
      checks: {
        redis,
        stopIndex: {
          status: indexCount > 0 ? 'ok' : 'down',
          count: indexCount,
          syncedAt: deps.stopsSyncedAt?.() ?? null,
        },
        lta: { circuit },
      },
    });
  });

  return router;
}
