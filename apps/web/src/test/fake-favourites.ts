import { vi } from 'vitest';
import type { Favourite, Stop } from '@/lib/api';
import { apiError, json } from './fake-fetch';

const TOKEN = { token: 'api-token', expiresAt: Date.now() + 15 * 60_000 };

export const stop = (code: string, description: string, inService = true): Favourite['stop'] => ({
  code,
  description,
  roadName: 'Joo Chiat Rd',
  latitude: 1.3,
  longitude: 103.9,
  inService,
});

export interface FakeFavourites {
  list: Favourite[];
  calls: Array<{ method: string; path: string; body: unknown; auth: string | undefined }>;
  /** Make the next change fail with this response. */
  failNext: (response: Response) => void;
}

/**
 * A small in-memory copy of the favourites API (docs/API.md), plus the token route.
 * Arrivals and anything else answer from `other`.
 */
export function serveFavourites(
  initial: Favourite[],
  stops: Record<string, Stop>,
  other: (path: string) => Response = () => apiError(404, 'NOT_FOUND'),
): FakeFavourites {
  const fake: FakeFavourites = { list: [...initial], calls: [], failNext: () => undefined };
  let failure: Response | null = null;
  fake.failNext = (response) => (failure = response);
  let nextId = 100;

  type Body = { busStopCode?: string; label?: string | null; ids?: string[] };
  const reply = (method: string, path: string, body: Body): Response => {
    if (path === '/api/token') return json(TOKEN);
    if (!path.startsWith('/v1/me/favourites')) return other(path);
    if (method !== 'GET' && failure) {
      const response = failure;
      failure = null;
      return response;
    }
    const id = path.split('/')[4];
    if (method === 'GET') return json({ favourites: fake.list });
    if (method === 'POST') {
      const s = stops[body.busStopCode!];
      if (!s) return apiError(404, 'NOT_FOUND', 'Unknown stop');
      const saved: Favourite = {
        id: `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`,
        label: null,
        sortOrder: fake.list.length,
        stop: { ...s, inService: true },
      };
      fake.list.push(saved);
      return json(saved, 201);
    }
    if (method === 'PUT') {
      fake.list = body.ids!.map((i, n) => ({
        ...fake.list.find((f) => f.id === i)!,
        sortOrder: n,
      }));
      return json({ favourites: fake.list });
    }
    const index = fake.list.findIndex((f) => f.id === id);
    if (index < 0) return apiError(404, 'NOT_FOUND');
    if (method === 'PATCH') {
      fake.list[index] = { ...fake.list[index]!, label: body.label ?? null };
      return json(fake.list[index]);
    }
    fake.list.splice(index, 1);
    return new Response(null, { status: 204 });
  };

  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const path = String(url).replace('https://api.test', '');
      const method = init?.method ?? 'GET';
      const body = (typeof init?.body === 'string' ? JSON.parse(init.body) : {}) as Body;
      fake.calls.push({ method, path, body, auth: (init?.headers as Record<string, string>)?.Authorization });
      return Promise.resolve(reply(method, path, body));
    }),
  );
  return fake;
}
