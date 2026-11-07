import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { signApiToken, TEST_JWT_SECRET } from '../helpers/api-token.js';
import { FakeUserRepository } from '../helpers/fake-user-repository.js';

const WEB_ORIGIN = 'http://localhost:3000';

function setup(env: NodeJS.ProcessEnv = {}) {
  const users = new FakeUserRepository();
  const onError = vi.fn();
  const app = createApp(
    loadConfig({
      NODE_ENV: 'test',
      API_JWT_SECRET: TEST_JWT_SECRET,
      CORS_ORIGINS: WEB_ORIGIN,
      ...env,
    }),
    { users, onError },
  );
  return { app, users, onError };
}

const bearer = async (subject = 'google:1', claims = {}) =>
  `Bearer ${await signApiToken(claims, { subject })}`;

describe('GET /v1/me', () => {
  it('creates the user on first call and returns only public fields', async () => {
    const { app, users } = setup();

    const res = await request(app)
      .get('/v1/me')
      .set(
        'Authorization',
        await bearer('google:1', {
          name: 'Ethan',
          email: 'ethan@example.com',
          picture: 'https://lh3.googleusercontent.com/a/1',
        }),
      );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 'user-1',
      name: 'Ethan',
      imageUrl: 'https://lh3.googleusercontent.com/a/1',
      createdAt: '2026-11-07T00:00:00.000Z',
    });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(users.users.get('google:1')?.email).toBe('ethan@example.com');
  });

  it('keeps the same user on later calls and updates their profile', async () => {
    const { app, users } = setup();
    await request(app)
      .get('/v1/me')
      .set('Authorization', await bearer('google:1', { name: 'Old' }));

    const res = await request(app)
      .get('/v1/me')
      .set('Authorization', await bearer('google:1', { name: 'New' }));

    expect(res.body).toMatchObject({ id: 'user-1', name: 'New' });
    expect(users.users.size).toBe(1);
  });

  it('keeps different people separate', async () => {
    const { app } = setup();

    const first = await request(app)
      .get('/v1/me')
      .set('Authorization', await bearer('google:1'));
    const second = await request(app)
      .get('/v1/me')
      .set('Authorization', await bearer('google:2'));

    expect(first.body.id).not.toBe(second.body.id);
  });

  it.each([
    ['no header', undefined],
    ['a non-bearer scheme', 'Basic abc'],
    ['an empty token', 'Bearer '],
    ['a garbage token', 'Bearer not.a.token'],
  ])('answers 401 with %s', async (_label, header) => {
    const { app, users } = setup();
    const req = request(app).get('/v1/me');
    if (header) void req.set('Authorization', header);

    const res = await req;

    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({
      code: 'UNAUTHENTICATED',
      requestId: res.headers['x-request-id'],
    });
    expect(users.users.size).toBe(0);
  });

  it('answers 401 for an expired token', async () => {
    const { app } = setup();
    const token = await signApiToken({}, { expiresIn: '-1s' });

    const res = await request(app).get('/v1/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
  });

  it('stays closed when no secret is configured', async () => {
    const { app } = setup({ API_JWT_SECRET: '' });

    const res = await request(app)
      .get('/v1/me')
      .set('Authorization', await bearer());

    expect(res.status).toBe(401);
  });

  it('answers 503, and reports it, when the database is down', async () => {
    const { app, users, onError } = setup();
    vi.spyOn(users, 'upsert').mockRejectedValue(new Error('database unavailable'));

    const res = await request(app)
      .get('/v1/me')
      .set('Authorization', await bearer());

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('DEPENDENCY_UNAVAILABLE');
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'GET /v1/me');
  });
});

describe('DELETE /v1/me', () => {
  it('deletes only the caller', async () => {
    const { app, users } = setup();
    await request(app)
      .get('/v1/me')
      .set('Authorization', await bearer('google:1'));
    await request(app)
      .get('/v1/me')
      .set('Authorization', await bearer('google:2'));

    const res = await request(app)
      .delete('/v1/me')
      .set('Authorization', await bearer('google:1'));

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect([...users.users.keys()]).toEqual(['google:2']);
  });

  it('answers 204 when the account is already gone, so a retry is safe', async () => {
    const { app } = setup();

    const res = await request(app)
      .delete('/v1/me')
      .set('Authorization', await bearer());

    expect(res.status).toBe(204);
  });

  it('answers 401 without a valid token and deletes nothing', async () => {
    const { app, users } = setup();
    await request(app)
      .get('/v1/me')
      .set('Authorization', await bearer('google:1'));

    const res = await request(app).delete('/v1/me');

    expect(res.status).toBe(401);
    expect(users.users.size).toBe(1);
  });

  it('answers 503 when the database is down', async () => {
    const { app, users } = setup();
    vi.spyOn(users, 'deleteBySubject').mockRejectedValue(new Error('database unavailable'));

    const res = await request(app)
      .delete('/v1/me')
      .set('Authorization', await bearer());

    expect(res.status).toBe(503);
  });
});

describe('rate limits', () => {
  it('count reads per user, so one person cannot use up another allowance', async () => {
    const { app } = setup({ RATE_LIMIT_USER_READS_PER_MINUTE: '1' });
    const auth = await bearer('google:1');

    expect((await request(app).get('/v1/me').set('Authorization', auth)).status).toBe(200);
    const limited = await request(app).get('/v1/me').set('Authorization', auth);
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');

    const other = await request(app)
      .get('/v1/me')
      .set('Authorization', await bearer('google:2'));
    expect(other.status).toBe(200);
  });

  it('count writes separately from reads', async () => {
    const { app } = setup({
      RATE_LIMIT_USER_READS_PER_MINUTE: '5',
      RATE_LIMIT_USER_WRITES_PER_MINUTE: '1',
    });
    const auth = await bearer();

    expect((await request(app).delete('/v1/me').set('Authorization', auth)).status).toBe(204);
    expect((await request(app).delete('/v1/me').set('Authorization', auth)).status).toBe(429);
    expect((await request(app).get('/v1/me').set('Authorization', auth)).status).toBe(200);
  });

  it('slow down repeated failed attempts from one address, even with a valid token after', async () => {
    const { app } = setup({ RATE_LIMIT_FAILED_AUTH_PER_MINUTE: '2' });
    for (let i = 0; i < 2; i += 1) {
      expect((await request(app).get('/v1/me')).status).toBe(401);
    }

    const res = await request(app)
      .get('/v1/me')
      .set('Authorization', await bearer());

    expect(res.status).toBe(429);
  });

  it('do not count successful requests against the failed-attempt limit', async () => {
    const { app } = setup({ RATE_LIMIT_FAILED_AUTH_PER_MINUTE: '1' });
    const auth = await bearer();

    for (let i = 0; i < 3; i += 1) {
      expect((await request(app).get('/v1/me').set('Authorization', auth)).status).toBe(200);
    }
  });
});

describe('CORS', () => {
  it('lets the web app send a token and delete from the browser', async () => {
    const { app } = setup();

    const res = await request(app)
      .options('/v1/me')
      .set('Origin', WEB_ORIGIN)
      .set('Access-Control-Request-Method', 'DELETE')
      .set('Access-Control-Request-Headers', 'authorization');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    expect(res.headers['access-control-allow-methods']).toContain('DELETE');
    expect(res.headers['access-control-allow-headers']).toContain('Authorization');
  });

  it('gives other origins no CORS headers', async () => {
    const { app } = setup();

    const res = await request(app).options('/v1/me').set('Origin', 'https://evil.example');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
