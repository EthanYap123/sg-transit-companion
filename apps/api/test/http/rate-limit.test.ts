import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { ArrivalsService } from '../../src/arrivals/arrivals-service.js';
import { CommandBudget } from '../../src/cache/command-budget.js';
import { loadConfig } from '../../src/config.js';
import { rateLimiter } from '../../src/http/rate-limit.js';
import { requestId } from '../../src/http/request-id.js';
import { StopIndex } from '../../src/stops/stop-index.js';
import { StopSyncService } from '../../src/stops/stop-sync.js';
import { FakeStopRepository } from '../helpers/fake-stop-repository.js';

const WEB_ORIGIN = 'http://localhost:3000';
const STOP = {
  code: '01012',
  description: 'Hotel Grand Pacific',
  roadName: 'Victoria St',
  latitude: 1.3,
  longitude: 103.8,
};

function setup(env: NodeJS.ProcessEnv = {}) {
  const index = new StopIndex([STOP]);
  const getBusArrival = vi.fn(() => Promise.resolve({ BusStopCode: '01012', Services: [] }));
  const arrivals = new ArrivalsService({
    lta: { getBusArrival },
    store: null,
    budget: new CommandBudget({ dailyLimit: 1 }),
  });
  const stopSync = new StopSyncService({
    lta: { getAllBusStops: () => new Promise(() => undefined) },
    repo: new FakeStopRepository(),
    store: null,
    index,
  });
  const config = loadConfig({
    NODE_ENV: 'test',
    CORS_ORIGINS: WEB_ORIGIN,
    CRON_SECRET: 'test-secret',
    RATE_LIMIT_PUBLIC_PER_MINUTE: '3',
    RATE_LIMIT_INTERNAL_PER_MINUTE: '2',
    ...env,
  });
  return createApp(config, { index, arrivals, stopSync });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('public routes', () => {
  it('tell clients their allowance', async () => {
    const res = await request(setup()).get('/v1/stops/01012');

    expect(res.status).toBe(200);
    expect(res.headers['ratelimit-limit']).toBe('3');
    expect(res.headers['ratelimit-remaining']).toBe('2');
    expect(Number(res.headers['ratelimit-reset'])).toBeGreaterThan(0);
  });

  it('answer 429 in the standard shape past the limit', async () => {
    const app = setup();
    for (let i = 0; i < 3; i += 1) await request(app).get('/v1/stops/01012');

    const res = await request(app).get('/v1/stops/01012');

    expect(res.status).toBe(429);
    expect(res.body.error).toEqual({
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please wait a moment and try again.',
      requestId: res.headers['x-request-id'],
    });
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('share one allowance across stop routes', async () => {
    const app = setup({ RATE_LIMIT_PUBLIC_PER_MINUTE: '2' });
    await request(app).get('/v1/stops/search?q=hotel');
    await request(app).get('/v1/stops/01012');

    const res = await request(app).get('/v1/stops/01012/arrivals');

    expect(res.status).toBe(429);
  });

  it('let the browser read a 429 and its headers from the web app', async () => {
    const app = setup({ RATE_LIMIT_PUBLIC_PER_MINUTE: '1' });
    await request(app).get('/v1/stops/01012').set('Origin', WEB_ORIGIN);

    const res = await request(app).get('/v1/stops/01012').set('Origin', WEB_ORIGIN);

    expect(res.status).toBe(429);
    expect(res.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    expect(res.headers['access-control-expose-headers']).toContain('Retry-After');
    expect(res.headers['access-control-expose-headers']).toContain('RateLimit-Remaining');
  });

  it('do not count browser preflight requests', async () => {
    const app = setup({ RATE_LIMIT_PUBLIC_PER_MINUTE: '1' });
    for (let i = 0; i < 3; i += 1) {
      await request(app)
        .options('/v1/stops/01012')
        .set('Origin', WEB_ORIGIN)
        .set('Access-Control-Request-Method', 'GET');
    }

    const res = await request(app).get('/v1/stops/01012');

    expect(res.status).toBe(200);
  });
});

describe('routes outside the limit', () => {
  it('health checks are never limited, so hosts do not see a false outage', async () => {
    const app = setup({ RATE_LIMIT_PUBLIC_PER_MINUTE: '1' });
    await request(app).get('/v1/stops/01012');

    for (let i = 0; i < 5; i += 1) {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.headers['ratelimit-limit']).toBeUndefined();
    }
  });
});

describe('internal routes', () => {
  it('limit attempts before checking the secret, so it cannot be guessed quickly', async () => {
    const app = setup();
    for (let i = 0; i < 2; i += 1) {
      const wrong = await request(app).post('/internal/stops/sync').set('Authorization', 'Bearer wrong');
      expect(wrong.status).toBe(401);
    }

    const res = await request(app).post('/internal/stops/sync').set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  it('have their own allowance, separate from public routes', async () => {
    const app = setup({ RATE_LIMIT_PUBLIC_PER_MINUTE: '1' });
    await request(app).get('/v1/stops/01012');

    const res = await request(app).post('/internal/stops/sync').set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(202);
  });
});

describe('client addresses behind a proxy', () => {
  const fromClient = (app: express.Express, ip: string) =>
    request(app).get('/v1/stops/01012').set('X-Forwarded-For', ip);

  it('count each client separately when the proxy is trusted', async () => {
    const app = setup({ RATE_LIMIT_PUBLIC_PER_MINUTE: '1', TRUST_PROXY: '1' });

    expect((await fromClient(app, '203.0.113.1')).status).toBe(200);
    expect((await fromClient(app, '203.0.113.1')).status).toBe(429);
    expect((await fromClient(app, '203.0.113.2')).status).toBe(200);
  });

  it('ignore a made-up X-Forwarded-For when no proxy is trusted, so it cannot dodge the limit', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = setup({ RATE_LIMIT_PUBLIC_PER_MINUTE: '1', TRUST_PROXY: '0' });

    expect((await fromClient(app, '203.0.113.1')).status).toBe(200);
    expect((await fromClient(app, '203.0.113.2')).status).toBe(429);
  });
});

describe('rateLimiter', () => {
  it('gives the allowance back when the window ends', async () => {
    const app = express();
    app.use(requestId(), rateLimiter({ limit: 1, windowMs: 60 }));
    app.get('/', (_req, res) => {
      res.send('ok');
    });

    expect((await request(app).get('/')).status).toBe(200);
    expect((await request(app).get('/')).status).toBe(429);

    await new Promise((resolve) => setTimeout(resolve, 80));

    expect((await request(app).get('/')).status).toBe(200);
  });
});
