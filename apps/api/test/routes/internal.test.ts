import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { StopIndex } from '../../src/stops/stop-index.js';
import { StopSyncService } from '../../src/stops/stop-sync.js';
import { FakeStopRepository } from '../helpers/fake-stop-repository.js';

const SECRET = 'test-cron-secret';

function setup(cronSecret = SECRET) {
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
  const app = createApp(loadConfig({ NODE_ENV: 'test', CRON_SECRET: cronSecret }), { stopSync, onError });
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
    expect(res.body).toEqual({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'POST /internal/stops/sync');
  });
});
