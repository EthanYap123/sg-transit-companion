import express, { type ErrorRequestHandler, type Express } from 'express';
import type { Config } from './config.js';
import { healthRouter } from './routes/health.js';
import { internalRouter } from './routes/internal.js';
import type { StopSyncService } from './stops/stop-sync.js';

export interface AppDeps {
  stopSync?: StopSyncService;
  onError?: (err: unknown, context: string) => void;
}

export function createApp(config: Config, deps: AppDeps = {}): Express {
  const app = express();
  const onError = deps.onError ?? (() => undefined);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.use(healthRouter(config));
  if (deps.stopSync) {
    app.use(
      '/internal',
      internalRouter({ cronSecret: config.CRON_SECRET, stopSync: deps.stopSync, onError }),
    );
  }

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  const handleError: ErrorRequestHandler = (err, req, res, _next) => {
    onError(err, `${req.method} ${req.path}`);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
  };
  app.use(handleError);

  return app;
}
