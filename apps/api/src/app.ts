import express, { type ErrorRequestHandler, type Express } from 'express';
import type { ArrivalsService } from './arrivals/arrivals-service.js';
import type { CacheStore } from './cache/store.js';
import type { Config } from './config.js';
import { corsForOrigins, parseOrigins } from './http/cors.js';
import { sendError } from './http/errors.js';
import { rateLimiter } from './http/rate-limit.js';
import { requestId } from './http/request-id.js';
import type { CircuitBreaker } from './lta/circuit-breaker.js';
import { healthRouter } from './routes/health.js';
import { internalRouter } from './routes/internal.js';
import { meRouter } from './routes/me.js';
import { stopsRouter } from './routes/stops.js';
import type { StopIndex } from './stops/stop-index.js';
import type { StopSyncService } from './stops/stop-sync.js';
import type { UserRepository } from './users/user-repository.js';
import type { FavouriteRepository } from './favourites/favourite-repository.js';

export interface AppDeps {
  index?: StopIndex;
  arrivals?: ArrivalsService;
  stopSync?: StopSyncService;
  users?: UserRepository;
  favourites?: FavouriteRepository;
  /** Null when Redis is not configured. */
  store?: CacheStore | null;
  ltaBreaker?: CircuitBreaker;
  onError?: (err: unknown, context: string) => void;
}

export function createApp(config: Config, deps: AppDeps = {}): Express {
  const app = express();
  const onError = deps.onError ?? (() => undefined);
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);
  app.use(requestId());
  app.use(express.json({ limit: '100kb' }));

  app.use(
    healthRouter(config, {
      index: deps.index,
      store: deps.store,
      ltaBreaker: deps.ltaBreaker,
      stopsSyncedAt: deps.stopSync ? () => deps.stopSync?.syncedAt ?? null : undefined,
    }),
  );

  // CORS comes before every limit so a browser can read a 429, and so preflights are not counted.
  app.use('/v1', corsForOrigins(parseOrigins(config.CORS_ORIGINS)));

  if (deps.index && deps.arrivals) {
    app.use(
      '/v1/stops',
      rateLimiter({ limit: config.RATE_LIMIT_PUBLIC_PER_MINUTE }),
      stopsRouter({ index: deps.index, arrivals: deps.arrivals }),
    );
  }
  if (deps.users) {
    app.use(
      '/v1/me',
      meRouter({
        jwtSecret: config.API_JWT_SECRET,
        users: deps.users,
        readsPerMinute: config.RATE_LIMIT_USER_READS_PER_MINUTE,
        writesPerMinute: config.RATE_LIMIT_USER_WRITES_PER_MINUTE,
        failedAuthPerMinute: config.RATE_LIMIT_FAILED_AUTH_PER_MINUTE,
        favourites:
          deps.favourites && deps.index ? { repository: deps.favourites, index: deps.index } : undefined,
        onError,
      }),
    );
  }
  if (deps.stopSync) {
    // The limit comes before the secret check, so the secret cannot be guessed quickly.
    app.use(
      '/internal',
      rateLimiter({ limit: config.RATE_LIMIT_INTERNAL_PER_MINUTE }),
      internalRouter({
        cronSecret: config.CRON_SECRET,
        stopSync: deps.stopSync,
        trustProxy: config.TRUST_PROXY,
        onError,
      }),
    );
  }

  app.use((_req, res) => sendError(res, 404, 'NOT_FOUND', 'Route not found'));

  const handleError: ErrorRequestHandler = (err, req, res, _next) => {
    // express.json() reports bad bodies as 4xx errors; everything else is our fault.
    const status = (err as { status?: unknown }).status;
    if (status === 413) {
      sendError(res, 413, 'VALIDATION_FAILED', 'Request body is too large');
      return;
    }
    if (typeof status === 'number' && status >= 400 && status < 500) {
      sendError(res, 400, 'VALIDATION_FAILED', 'Request body is not valid JSON');
      return;
    }
    onError(err, `${req.method} ${req.path}`);
    sendError(res, 500, 'INTERNAL', 'Something went wrong');
  };
  app.use(handleError);

  return app;
}
