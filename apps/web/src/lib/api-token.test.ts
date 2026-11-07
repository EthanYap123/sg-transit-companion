import { beforeEach, describe, expect, it, vi } from 'vitest';
import { json } from '@/test/fake-fetch';
import { clearApiToken, getApiToken } from './api-token';

const NOW = Date.parse('2026-11-07T08:00:00Z');

function serveToken(token: string, expiresAt = NOW + 15 * 60_000) {
  const fetch = vi.fn(() => Promise.resolve(json({ token, expiresAt })));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

beforeEach(() => {
  clearApiToken();
  vi.useFakeTimers({ now: NOW });
  localStorage.clear();
});

describe('getApiToken', () => {
  it('fetches a token once and reuses it', async () => {
    const fetch = serveToken('first');

    expect(await getApiToken()).toBe('first');
    expect(await getApiToken()).toBe('first');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/token');
  });

  it('gets a new one shortly before the old one expires', async () => {
    const fetch = serveToken('first');
    await getApiToken();

    vi.setSystemTime(NOW + 15 * 60_000 - 29_000);
    fetch.mockResolvedValue(json({ token: 'second', expiresAt: NOW + 30 * 60_000 }));

    expect(await getApiToken()).toBe('second');
  });

  it('keeps tokens out of browser storage', async () => {
    serveToken('first');

    await getApiToken();

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('forgets the token after clearApiToken', async () => {
    const fetch = serveToken('first');
    await getApiToken();

    clearApiToken();
    await getApiToken();

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('returns null when signed out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(json({ error: 'Not signed in' }, 401))),
    );

    await expect(getApiToken()).resolves.toBeNull();
  });

  it('throws on a server problem rather than pretending to be signed out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(json({}, 500))),
    );

    await expect(getApiToken()).rejects.toThrow('500');
  });
});
