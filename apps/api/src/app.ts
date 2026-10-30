import express, { type Express } from 'express';
import type { Config } from './config.js';
import { healthRouter } from './routes/health.js';

export function createApp(config: Config): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.use(healthRouter(config));

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  return app;
}
