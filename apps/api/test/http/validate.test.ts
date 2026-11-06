import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { validate } from '../../src/http/validate.js';
import { requestId } from '../../src/http/request-id.js';

const body = z.object({
  label: z.string().trim().min(1, 'must not be empty'),
  order: z.number().int().default(0),
});

function appFor(field?: string) {
  const app = express();
  app.use(requestId(), express.json());
  app.post('/', (req, res) => {
    const value = validate(res, body, req.body, field);
    if (value === undefined) return;
    res.json(value);
  });
  return app;
}

describe('validate', () => {
  it('returns the parsed value, with trimming and defaults applied', async () => {
    const res = await request(appFor()).post('/').send({ label: '  Home  ' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ label: 'Home', order: 0 });
  });

  it('sends the standard 400 naming each failing field', async () => {
    const res = await request(appFor()).post('/').send({ label: ' ', order: 1.5 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'label: must not be empty',
      requestId: res.headers['x-request-id'],
    });
    const details = res.body.error.details as Array<{ path: string }>;
    expect(details.map((d) => d.path)).toEqual(['label', 'order']);
  });

  it('prefixes the field name for a value validated on its own', async () => {
    const res = await request(appFor('favourite')).post('/').send({ label: '' });

    expect(res.body.error.details[0].path).toBe('favourite.label');
  });

  it('names the request when the whole value is the wrong type', async () => {
    const res = await request(appFor()).post('/').send([]);

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('request');
  });
});
