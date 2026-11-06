import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { MemoryStore } from '../src/cache/store.js';
import { loadConfig } from '../src/config.js';
import { CircuitBreaker } from '../src/lta/circuit-breaker.js';
import { StopIndex } from '../src/stops/stop-index.js';

const config = loadConfig({ NODE_ENV: 'test', APP_VERSION: '1.2.3', GIT_COMMIT: 'abc1234' });
const stop = {
  code: '01012',
  description: 'Hotel Grand Pacific',
  roadName: 'Victoria St',
  latitude: 1.3,
  longitude: 103.8,
};

describe('GET /health', () => {
  it('reports ok with version and commit', async () => {
    const res = await request(createApp(config)).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', version: '1.2.3', commit: 'abc1234' });
    expect(res.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('reports each dependency when the app is fully wired', async () => {
    const app = createApp(config, {
      index: new StopIndex([stop]),
      store: new MemoryStore(),
      ltaBreaker: new CircuitBreaker(),
    });

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({
      status: 'ok',
      checks: {
        redis: 'ok',
        stopIndex: { status: 'ok', count: 1, syncedAt: null },
        lta: { circuit: 'closed' },
      },
    });
  });

  it('is degraded, not down, when Redis or LTA is unhealthy', async () => {
    const store = new MemoryStore();
    vi.spyOn(store, 'ping').mockResolvedValue(false);
    const breaker = new CircuitBreaker();
    breaker.trip(60_000);

    const res = await request(
      createApp(config, { index: new StopIndex([stop]), store, ltaBreaker: breaker }),
    ).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'degraded',
      checks: { redis: 'down', lta: { circuit: 'open' } },
    });
  });

  it('says Redis is disabled when it is not configured', async () => {
    const res = await request(createApp(config, { index: new StopIndex([stop]), store: null })).get(
      '/health',
    );

    expect(res.body).toMatchObject({ status: 'ok', checks: { redis: 'disabled' } });
  });

  it('is down, with 503, while the stop index is empty', async () => {
    const res = await request(createApp(config, { index: new StopIndex() })).get('/health');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'down', checks: { stopIndex: { status: 'down', count: 0 } } });
  });
});

describe('errors outside the routes', () => {
  it('unknown routes return the standard 404 error shape', async () => {
    const res = await request(createApp(config)).get('/nope');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Route not found', requestId: res.headers['x-request-id'] },
    });
  });

  it('a body that is not valid JSON is a 400, not a 500', async () => {
    const res = await request(createApp(config))
      .post('/anything')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Request body is not valid JSON',
    });
  });

  it('a body over 100 KB is a 413 that says so', async () => {
    const res = await request(createApp(config))
      .post('/anything')
      .send({ note: 'x'.repeat(101 * 1024) });

    expect(res.status).toBe(413);
    expect(res.body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Request body is too large',
    });
  });
});
