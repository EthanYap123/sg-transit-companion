import { describe, expect, it } from 'vitest';
import { nextRefreshDelay } from './use-arrivals';

describe('nextRefreshDelay', () => {
  const now = Date.parse('2026-11-04T08:00:00+08:00');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it.each([
    ['data fetched just now', 0, 21_000],
    ['data 6 s old from a shared cache', 6_000, 15_000],
    ['data 15 s old, not sooner than the browser cache allows', 15_000, 11_000],
    ['old stale data, still not hammering the API', 300_000, 11_000],
    ['a server clock ahead of this device, never over the maximum', -30_000, 21_000],
  ])('%s', (_label, age, delay) => {
    expect(nextRefreshDelay(ago(age), now)).toBe(delay);
  });
});
