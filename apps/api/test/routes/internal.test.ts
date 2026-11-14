import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { StopIndex } from '../../src/stops/stop-index.js';
import { StopSyncService } from '../../src/stops/stop-sync.js';
import { FakeStopRepository } from '../helpers/fake-stop-repository.js';

const SECRET = 'test-cron-secret';

function setup(cronSecret = SECRET, env: Record<string, string> = {}) {
  const repo = new FakeStopRepository();
  let finish: () => void = () => undefined;
  const getAllBusStops = vi.fn(
    () =>
      new Promise<[]>((resolve) => {
        finish = () => resolve([]);
      }),
  );
  const onError = vi.fn();
  const stopSync = new StopSyncService({
    lta: { getAllBusStops },
    repo,
    store: null,
    index: new StopIndex(),
  });
  const app = createApp(loadConfig({ NODE_ENV: 'test', CRON_SECRET: cronSecret, ...env }), {
    stopSync,
    onError,
  });
  return { app, repo, stopSync, onError, finish: () => finish() };
}

describe('POST /internal/stops/sync', () => {
  it('starts a sync and answers 202 with the run id', async () => {
    const { app, repo } = setup();

    const res = await request(app).post('/internal/stops/sync').set('Authorization', `Bearer ${SECRET}`);

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ runId: 'run-1' });
    expect(repo.runs.get('run-1')).toBe('running');
  });

  it('answers 409 while a sync is already running', async () => {
    const { app } = setup();
    const auth = `Bearer ${SECRET}`;

    await request(app).post('/internal/stops/sync').set('Authorization', auth);
    const res = await request(app).post('/internal/stops/sync').set('Authorization', auth);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('reports a sync that fails after answering', async () => {
    const { app, onError, finish } = setup();

    await request(app).post('/internal/stops/sync').set('Authorization', `Bearer ${SECRET}`);
    finish();

    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.any(Error), 'stop sync run-1'));
  });

  it.each([
    ['no header', undefined],
    ['the wrong secret', 'Bearer nope'],
    ['a non-bearer scheme', `Basic ${SECRET}`],
  ])('answers 401 with %s', async (_label, header) => {
    const { app, repo } = setup();
    const req = request(app).post('/internal/stops/sync');
    if (header) void req.set('Authorization', header);

    const res = await req;

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(repo.runs.size).toBe(0);
  });

  it('stays closed when no secret is configured', async () => {
    const { app } = setup('');

    const res = await request(app).post('/internal/stops/sync').set('Authorization', 'Bearer ');

    expect(res.status).toBe(401);
  });

  it('answers 500 with the standard error shape when the run cannot be recorded', async () => {
    const { app, repo, onError } = setup();
    vi.spyOn(repo, 'startRun').mockRejectedValue(new Error('database unavailable'));

    const res = await request(app).post('/internal/stops/sync').set('Authorization', `Bearer ${SECRET}`);

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({
      code: 'INTERNAL',
      message: 'Something went wrong',
      requestId: res.headers['x-request-id'],
    });
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'POST /internal/stops/sync');
  });
});

describe('GET /internal/client-ip', () => {
  // Documentation addresses (RFC 5737), never real clients.
  const CHAIN = '203.0.113.5, 198.51.100.7';

  it('shows the socket address and the raw header when no proxy is trusted', async () => {
    const { app } = setup();

    const res = await request(app)
      .get('/internal/client-ip')
      .set('Authorization', `Bearer ${SECRET}`)
      .set('X-Forwarded-For', CHAIN);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({ ips: [], forwardedFor: CHAIN, trustProxy: 0 });
    expect(res.body.ip).toMatch(/127\.0\.0\.1$/);
  });

  it('takes the address one hop back when one proxy is trusted', async () => {
    const { app } = setup(SECRET, { TRUST_PROXY: '1' });

    const res = await request(app)
      .get('/internal/client-ip')
      .set('Authorization', `Bearer ${SECRET}`)
      .set('X-Forwarded-For', CHAIN);

    expect(res.body).toMatchObject({ ip: '198.51.100.7', ips: ['198.51.100.7'], trustProxy: 1 });
  });

  it('takes the address two hops back when two proxies are trusted', async () => {
    const { app } = setup(SECRET, { TRUST_PROXY: '2' });

    const res = await request(app)
      .get('/internal/client-ip')
      .set('Authorization', `Bearer ${SECRET}`)
      .set('X-Forwarded-For', CHAIN);

    expect(res.body).toMatchObject({
      ip: '203.0.113.5',
      ips: ['203.0.113.5', '198.51.100.7'],
      trustProxy: 2,
    });
  });

  it('reports a missing header as null', async () => {
    const { app } = setup();

    const res = await request(app).get('/internal/client-ip').set('Authorization', `Bearer ${SECRET}`);

    expect(res.body.forwardedFor).toBeNull();
  });

  it('answers 401 without the secret', async () => {
    const { app } = setup();

    const res = await request(app).get('/internal/client-ip').set('X-Forwarded-For', CHAIN);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});
