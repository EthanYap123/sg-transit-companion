import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { ArrivalsService } from '../../src/arrivals/arrivals-service.js';
import { CommandBudget } from '../../src/cache/command-budget.js';
import { MemoryStore } from '../../src/cache/store.js';
import { loadConfig } from '../../src/config.js';
import { createLtaClient } from '../../src/lta/client.js';
import { ltaBusStopsPageSchema } from '../../src/lta/schemas.js';
import { stopsFromLta, type Stop } from '../../src/stops/stop.js';
import { StopIndex } from '../../src/stops/stop-index.js';
import { jsonResponse, ltaFixture } from '../helpers/fixtures.js';

const WEB_ORIGIN = 'http://localhost:3000';
const STOP_83139: Stop = {
  code: '83139',
  description: 'Aft Joo Chiat Pl',
  roadName: 'Joo Chiat Rd',
  latitude: 1.3155,
  longitude: 103.9059,
};
const STOPS = [
  ...stopsFromLta(ltaBusStopsPageSchema.parse(ltaFixture('bus-stops-first-page')).value),
  STOP_83139,
];

type FakeReply = Response | Error;
type ServiceList = Array<{ serviceNo: string }>;

/**
 * The real LTA client, arrivals cache and normaliser, with only LTA's network replies faked.
 * Replies are used in order; the last one repeats.
 */
function setup(replies: FakeReply[] = [jsonResponse(ltaFixture('bus-arrival-83139-day'))], stops = STOPS) {
  let time = Date.parse('2026-10-31T17:00:00+08:00');
  const now = () => time;
  const queue = [...replies];
  const fetch = vi.fn(() => {
    const reply = queue.length > 1 ? queue.shift()! : queue[0]!;
    return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply.clone());
  });
  const lta = createLtaClient({
    accountKey: 'test-key',
    baseUrl: 'https://lta.example',
    fetch,
    sleep: () => Promise.resolve(),
  });
  const store = new MemoryStore(now);
  const arrivals = new ArrivalsService({
    lta,
    store,
    budget: new CommandBudget({ dailyLimit: 1_000, now }),
    now,
  });
  const onError = vi.fn();
  const app = createApp(loadConfig({ NODE_ENV: 'test', CORS_ORIGINS: `${WEB_ORIGIN}/` }), {
    index: new StopIndex(stops),
    arrivals,
    store,
    ltaBreaker: lta.breaker,
    onError,
  });
  return { app, fetch, arrivals, onError, advance: (ms: number) => (time += ms) };
}

const timeout = () => Object.assign(new Error('The operation timed out'), { name: 'TimeoutError' });

describe('GET /v1/stops/search', () => {
  it('returns ranked matches with a one hour cache', async () => {
    const { app, fetch } = setup();

    const res = await request(app).get('/v1/stops/search?q=bugis');

    expect(res.status).toBe(200);
    expect(res.body.query).toBe('bugis');
    expect(res.body.results).toHaveLength(6);
    const [first] = res.body.results as Array<Record<string, unknown>>;
    expect(Object.keys(first!).sort()).toEqual(['code', 'description', 'latitude', 'longitude', 'roadName']);
    expect(first).toMatchObject({ code: '01039', description: 'Bugis Cube', roadName: 'Nth Bridge Rd' });
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('trims the query and honours the limit', async () => {
    const { app } = setup();

    const res = await request(app).get('/v1/stops/search').query({ q: '  vic st  ', limit: '2' });

    expect(res.body.query).toBe('vic st');
    expect(res.body.results).toHaveLength(2);
  });

  it.each([
    ['a missing query', {}, 'q'],
    ['a one-letter query', { q: 'a' }, 'q'],
    ['a query over 50 characters', { q: 'x'.repeat(51) }, 'q'],
    ['a limit over 20', { q: 'bugis', limit: '50' }, 'limit'],
    ['a non-numeric limit', { q: 'bugis', limit: 'lots' }, 'limit'],
  ])('rejects %s with 400', async (_label, query, path) => {
    const { app } = setup();

    const res = await request(app).get('/v1/stops/search').query(query);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(res.body.error.details[0].path).toBe(path);
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });
});

describe('GET /v1/stops/:code', () => {
  it('returns one stop', async () => {
    const { app } = setup();

    const res = await request(app).get('/v1/stops/01012');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ code: '01012', description: 'Hotel Grand Pacific' });
  });

  it('answers 404 for an unknown stop and 400 for a malformed code', async () => {
    const { app } = setup();

    const missing = await request(app).get('/v1/stops/99999');
    const malformed = await request(app).get('/v1/stops/abc');

    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error).toMatchObject({ code: 'VALIDATION_FAILED', details: [{ path: 'code' }] });
  });
});

describe('GET /v1/stops/:code/arrivals', () => {
  it('returns normalised live arrivals with a 10 second cache', async () => {
    const { app } = setup();

    const res = await request(app).get('/v1/stops/83139/arrivals');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ stopCode: '83139', stale: false, source: 'lta' });
    expect((res.body.services as ServiceList).map((s) => s.serviceNo)).toEqual(['15', '150', '155']);
    expect(res.headers['cache-control']).toBe('public, max-age=10');
  });

  it('filters to one service, ignoring case', async () => {
    const { app } = setup([jsonResponse(ltaFixture('bus-arrival-01012-city'))]);

    const res = await request(app).get('/v1/stops/01012/arrivals?service=12E');

    expect((res.body.services as ServiceList).map((s) => s.serviceNo)).toEqual(['12e']);
  });

  it('returns an empty list for a service that does not stop there', async () => {
    const { app } = setup();

    const res = await request(app).get('/v1/stops/83139/arrivals?service=999');

    expect(res.status).toBe(200);
    expect(res.body.services).toEqual([]);
  });

  it('treats no buses at night as a normal answer', async () => {
    const { app } = setup([jsonResponse(ltaFixture('bus-arrival-night'))]);

    const res = await request(app).get('/v1/stops/83139/arrivals');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ services: [], stale: false });
  });

  it('serves stale data, flagged, when LTA fails after a good answer', async () => {
    const { app, advance } = setup([
      jsonResponse(ltaFixture('bus-arrival-83139-day')),
      jsonResponse({}, 500),
    ]);
    await request(app).get('/v1/stops/83139/arrivals');
    advance(60_000);

    const res = await request(app).get('/v1/stops/83139/arrivals');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ stale: true, source: 'stale', fetchedAt: '2026-10-31T17:00:00+08:00' });
  });

  it.each([
    ['times out', [timeout()]],
    ['answers 500', [jsonResponse({}, 500)]],
    ['rate limits us', [jsonResponse({}, 429)]],
    ['sends malformed data', [jsonResponse({ Services: 'nope' })]],
  ])('answers 503 LTA_UNAVAILABLE when LTA %s and nothing is cached', async (_label, replies) => {
    const { app } = setup(replies);

    const res = await request(app).get('/v1/stops/83139/arrivals');

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('LTA_UNAVAILABLE');
    expect(res.headers['retry-after']).toBe('30');
  });

  it('answers 404 for a stop that does not exist, without calling LTA', async () => {
    const { app, fetch } = setup();

    const res = await request(app).get('/v1/stops/99999/arrivals');

    expect(res.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('still asks LTA while the stop list is loading', async () => {
    const { app } = setup(undefined, []);

    const res = await request(app).get('/v1/stops/83139/arrivals');

    expect(res.status).toBe(200);
  });

  it('rejects a malformed code or service with 400', async () => {
    const { app } = setup();

    const badCode = await request(app).get('/v1/stops/8313/arrivals');
    const badService = await request(app).get('/v1/stops/83139/arrivals?service=15;DROP');

    expect(badCode.status).toBe(400);
    expect(badService.status).toBe(400);
    expect(badService.body.error.details[0].path).toBe('service');
  });

  it('answers 500 with a request id, and reports the error, for an unexpected failure', async () => {
    const { app, arrivals, onError } = setup();
    vi.spyOn(arrivals, 'getArrivals').mockRejectedValue(new TypeError('bug'));

    const res = await request(app).get('/v1/stops/83139/arrivals');

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({
      code: 'INTERNAL',
      message: 'Something went wrong',
      requestId: res.headers['x-request-id'],
    });
    expect(onError).toHaveBeenCalledWith(expect.any(TypeError), 'GET /v1/stops/83139/arrivals');
  });
});

describe('CORS', () => {
  it('allows the web app origin and exposes the request id', async () => {
    const { app } = setup();

    const res = await request(app).get('/v1/stops/01012').set('Origin', WEB_ORIGIN);

    expect(res.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    expect(res.headers['access-control-expose-headers']).toBe('X-Request-Id');
  });

  it('answers the browser preflight', async () => {
    const { app } = setup();

    const res = await request(app)
      .options('/v1/stops/search')
      .set('Origin', WEB_ORIGIN)
      .set('Access-Control-Request-Method', 'GET');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-methods']).toBe('GET');
  });

  it('gives other origins no CORS headers', async () => {
    const { app } = setup();

    const res = await request(app).get('/v1/stops/01012').set('Origin', 'https://evil.example');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('request ids', () => {
  it('keeps a well-formed id from the caller', async () => {
    const { app } = setup();

    const res = await request(app).get('/v1/stops/01012').set('X-Request-Id', 'abc-12345678');

    expect(res.headers['x-request-id']).toBe('abc-12345678');
  });

  it('replaces a malformed one', async () => {
    const { app } = setup();

    const res = await request(app).get('/v1/stops/01012').set('X-Request-Id', 'bad id; drop');

    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
