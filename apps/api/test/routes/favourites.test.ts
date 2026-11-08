import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import type { Stop } from '../../src/stops/stop.js';
import { StopIndex } from '../../src/stops/stop-index.js';
import { signApiToken, TEST_JWT_SECRET } from '../helpers/api-token.js';
import { FakeFavouriteRepository } from '../helpers/fake-favourite-repository.js';
import { FakeUserRepository } from '../helpers/fake-user-repository.js';

const stop = (code: string, description = `Stop ${code}`): Stop => ({
  code,
  description,
  roadName: 'Victoria St',
  latitude: 1.3,
  longitude: 103.8,
});

/** 25 stops, so the 20-favourite limit can be reached. */
const STOPS = Array.from({ length: 25 }, (_, i) => stop(String(10_000 + i)));
const CLOSED = stop('99999', 'Closed stop');

function setup(env: NodeJS.ProcessEnv = {}) {
  const index = new StopIndex(STOPS);
  const favourites = new FakeFavouriteRepository(new Map([...STOPS, CLOSED].map((s) => [s.code, s])));
  const onError = vi.fn();
  const app = createApp(loadConfig({ NODE_ENV: 'test', API_JWT_SECRET: TEST_JWT_SECRET, ...env }), {
    index,
    users: new FakeUserRepository(),
    favourites,
    onError,
  });
  return { app, favourites, index, onError };
}

const auth = async (subject = 'google:1') => `Bearer ${await signApiToken({}, { subject })}`;

type Body = { favourites: Array<{ id: string; label: string | null; stop: { code: string } }> };

async function add(app: ReturnType<typeof setup>['app'], code: string, label?: string, subject?: string) {
  return request(app)
    .post('/v1/me/favourites')
    .set('Authorization', await auth(subject))
    .send(label === undefined ? { busStopCode: code } : { busStopCode: code, label });
}

describe('GET /v1/me/favourites', () => {
  it('starts empty and is never cached', async () => {
    const { app } = setup();

    const res = await request(app)
      .get('/v1/me/favourites')
      .set('Authorization', await auth());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ favourites: [] });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('lists the stop details and whether LTA still lists the stop', async () => {
    const { app, favourites } = setup();
    await add(app, '10000', 'Home');
    await favourites.add(
      { authSubject: 'google:1', name: null, email: null, imageUrl: null },
      CLOSED.code,
      null,
      20,
    );

    const res = await request(app)
      .get('/v1/me/favourites')
      .set('Authorization', await auth());

    expect(res.body.favourites).toEqual([
      {
        id: expect.any(String) as string,
        label: 'Home',
        sortOrder: 0,
        stop: { ...STOPS[0], inService: true },
      },
      expect.objectContaining({
        stop: expect.objectContaining({ code: '99999', inService: false }) as unknown,
      }),
    ]);
  });

  it('answers 401 without a token', async () => {
    const { app } = setup();

    expect((await request(app).get('/v1/me/favourites')).status).toBe(401);
  });
});

describe('POST /v1/me/favourites', () => {
  it('saves a stop with a trimmed label', async () => {
    const { app } = setup();

    const res = await add(app, '10000', '  School  ');

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ label: 'School', stop: { code: '10000', inService: true } });
  });

  it('treats a blank label as no label', async () => {
    const { app } = setup();

    expect((await add(app, '10000', '   ')).body.label).toBeNull();
    expect((await add(app, '10001')).body.label).toBeNull();
  });

  it('answers 409 for a stop already saved', async () => {
    const { app } = setup();
    await add(app, '10000');

    const res = await add(app, '10000');

    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'CONFLICT', message: 'This stop is already saved' });
  });

  it('allows 20 favourites and explains the limit on the 21st', async () => {
    const { app } = setup({ RATE_LIMIT_USER_WRITES_PER_MINUTE: '100' });
    for (let i = 0; i < 20; i += 1) expect((await add(app, String(10_000 + i))).status).toBe(201);

    const res = await add(app, '10020');

    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'CONFLICT',
      message: 'You can save up to 20 stops',
      details: [{ path: 'limit', issue: '20' }],
    });
  });

  it('answers 404 for a stop that does not exist', async () => {
    const { app } = setup();

    const res = await add(app, '12345');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it.each([
    ['a malformed code', { busStopCode: '1234' }, 'busStopCode'],
    ['a label over 30 characters', { busStopCode: '10000', label: 'x'.repeat(31) }, 'label'],
    ['no body', {}, 'busStopCode'],
  ])('answers 400 for %s', async (_label, body, path) => {
    const { app } = setup();

    const res = await request(app)
      .post('/v1/me/favourites')
      .set('Authorization', await auth())
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe(path);
  });

  it('keeps each user’s favourites separate', async () => {
    const { app } = setup();
    await add(app, '10000', undefined, 'google:1');

    const other = await request(app)
      .get('/v1/me/favourites')
      .set('Authorization', await auth('google:2'));
    const sameStop = await add(app, '10000', undefined, 'google:2');

    expect(other.body).toEqual({ favourites: [] });
    expect(sameStop.status).toBe(201);
  });
});

describe('PATCH /v1/me/favourites/:id', () => {
  it('renames, and clears the label with null', async () => {
    const { app } = setup();
    const { id } = (await add(app, '10000', 'Home')).body as { id: string };

    const renamed = await request(app)
      .patch(`/v1/me/favourites/${id}`)
      .set('Authorization', await auth())
      .send({ label: 'Gym' });
    const cleared = await request(app)
      .patch(`/v1/me/favourites/${id}`)
      .set('Authorization', await auth())
      .send({ label: null });

    expect(renamed.body.label).toBe('Gym');
    expect(cleared.body.label).toBeNull();
  });

  it('answers 404 for another user’s favourite, without changing it', async () => {
    const { app, favourites } = setup();
    const { id } = (await add(app, '10000', 'Home', 'google:1')).body as { id: string };

    const res = await request(app)
      .patch(`/v1/me/favourites/${id}`)
      .set('Authorization', await auth('google:2'))
      .send({ label: 'Mine now' });

    expect(res.status).toBe(404);
    expect(favourites.rows[0]?.label).toBe('Home');
  });

  it('answers 400 for a malformed id or a missing label', async () => {
    const { app } = setup();
    const { id } = (await add(app, '10000')).body as { id: string };

    const badId = await request(app)
      .patch('/v1/me/favourites/nope')
      .set('Authorization', await auth())
      .send({ label: 'x' });
    const noLabel = await request(app)
      .patch(`/v1/me/favourites/${id}`)
      .set('Authorization', await auth())
      .send({});

    expect(badId.status).toBe(400);
    expect(badId.body.error.details[0].path).toBe('id');
    expect(noLabel.status).toBe(400);
  });
});

describe('PUT /v1/me/favourites/order', () => {
  it('saves a new order', async () => {
    const { app } = setup();
    const ids: string[] = [];
    for (const code of ['10000', '10001', '10002'])
      ids.push(((await add(app, code)).body as { id: string }).id);

    const res = await request(app)
      .put('/v1/me/favourites/order')
      .set('Authorization', await auth())
      .send({ ids: [ids[2], ids[0], ids[1]] });

    expect(res.status).toBe(200);
    expect((res.body as Body).favourites.map((f) => f.stop.code)).toEqual(['10002', '10000', '10001']);
  });

  it.each([
    ['leaves one out', (ids: string[]) => ids.slice(0, 1)],
    ['repeats one', (ids: string[]) => [ids[0], ids[0]]],
    ['includes an unknown id', (ids: string[]) => [ids[0], '00000000-0000-4000-8000-000000000000']],
  ])('answers 400 when the list %s', async (_label, make) => {
    const { app } = setup();
    const ids: string[] = [];
    for (const code of ['10000', '10001']) ids.push(((await add(app, code)).body as { id: string }).id);

    const res = await request(app)
      .put('/v1/me/favourites/order')
      .set('Authorization', await auth())
      .send({ ids: make(ids) });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_FAILED', details: [{ path: 'ids' }] });
  });
});

describe('DELETE /v1/me/favourites/:id', () => {
  it('removes a favourite', async () => {
    const { app } = setup();
    const { id } = (await add(app, '10000')).body as { id: string };

    const res = await request(app)
      .delete(`/v1/me/favourites/${id}`)
      .set('Authorization', await auth());
    const after = await request(app)
      .get('/v1/me/favourites')
      .set('Authorization', await auth());

    expect(res.status).toBe(204);
    expect(after.body).toEqual({ favourites: [] });
  });

  it('answers 404 for another user’s favourite, and keeps it', async () => {
    const { app, favourites } = setup();
    const { id } = (await add(app, '10000', undefined, 'google:1')).body as { id: string };

    const res = await request(app)
      .delete(`/v1/me/favourites/${id}`)
      .set('Authorization', await auth('google:2'));

    expect(res.status).toBe(404);
    expect(favourites.rows).toHaveLength(1);
  });
});

describe('failures and limits', () => {
  it('answers 503, and reports it, when the database fails', async () => {
    const { app, favourites, onError } = setup();
    vi.spyOn(favourites, 'list').mockRejectedValue(new Error('database unavailable'));

    const res = await request(app)
      .get('/v1/me/favourites')
      .set('Authorization', await auth());

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('DEPENDENCY_UNAVAILABLE');
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'GET /v1/me/favourites');
  });

  it('counts saves against the per-user write limit', async () => {
    const { app } = setup({ RATE_LIMIT_USER_WRITES_PER_MINUTE: '1' });

    expect((await add(app, '10000')).status).toBe(201);
    expect((await add(app, '10001')).status).toBe(429);
  });
});
