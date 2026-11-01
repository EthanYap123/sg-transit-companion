import { createApp } from './app.js';
import { RedisStore } from './cache/store.js';
import { loadConfig } from './config.js';
import { createPrismaClient } from './db.js';
import { createLtaClient } from './lta/client.js';
import { StopIndex } from './stops/stop-index.js';
import { PrismaStopRepository } from './stops/stop-repository.js';
import { StopSyncService } from './stops/stop-sync.js';

// Replaced by pino structured logging in Phase 5.
const onError = (err: unknown, context: string) => {
  console.error(`[${context}]`, err instanceof Error ? err.message : err);
};

const config = loadConfig();
if (!config.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env.');
  process.exit(1);
}

const store = config.REDIS_URL ? new RedisStore(config.REDIS_URL, config.REDIS_KEY_PREFIX) : null;
if (store) {
  await store.connect().catch((err: unknown) => onError(err, 'Redis unavailable, continuing without it'));
}

const lta = createLtaClient({ accountKey: config.LTA_ACCOUNT_KEY, baseUrl: config.LTA_BASE_URL });
const index = new StopIndex();
const stopSync = new StopSyncService({
  lta,
  repo: new PrismaStopRepository(createPrismaClient(config.DATABASE_URL)),
  store,
  index,
  onError,
});

const app = createApp(config, { stopSync, onError });

app.listen(config.PORT, () => {
  console.log(`API listening on http://localhost:${config.PORT}`);
  void stopSync.loadIndex().then(({ source, count }) => {
    console.log(`Bus stop index: ${count} stops from ${source}`);
  });
});
