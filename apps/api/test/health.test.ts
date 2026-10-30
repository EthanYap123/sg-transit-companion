import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const app = createApp(loadConfig({ NODE_ENV: 'test', APP_VERSION: '1.2.3', GIT_COMMIT: 'abc1234' }));

describe('GET /health', () => {
  it('reports ok with version and commit', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', version: '1.2.3', commit: 'abc1234' });
    expect(res.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});

describe('unknown routes', () => {
  it('return the standard 404 error shape', async () => {
    const res = await request(app).get('/nope');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });
});
