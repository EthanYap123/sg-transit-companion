import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RedisStore } from '../../src/cache/store.js';

/** Runs against a real Redis when REDIS_URL is set (CI service container, or Docker Compose locally). */
const url = process.env.REDIS_URL;

describe.skipIf(!url)('RedisStore against a real Redis', () => {
  const prefix = 'test';
  const store = new RedisStore(url ?? '', prefix);
  const key = `store-test:${process.pid}`;

  beforeAll(() => store.connect());
  afterAll(() => store.close());

  it('answers ping', async () => {
    expect(await store.ping()).toBe(true);
  });

  it('stores and reads a value with an expiry', async () => {
    await store.set(key, 'hello', 30);

    expect(await store.get(key)).toBe('hello');
    expect(await store.get(`${key}:missing`)).toBeNull();
  });

  it('counts with incrBy', async () => {
    const counter = `${key}:count`;

    expect(await store.incrBy(counter, 5, 30)).toBe(5);
    expect(await store.incrBy(counter, 2, 30)).toBe(7);
  });
});

describe('RedisStore when Redis is unreachable', () => {
  it('fails fast instead of hanging, and ping reports false', async () => {
    const store = new RedisStore('redis://127.0.0.1:1', 'test');

    await expect(store.connect()).rejects.toThrow();
    await expect(store.get('anything')).rejects.toThrow();
    expect(await store.ping()).toBe(false);
    await store.close();
  });
});
