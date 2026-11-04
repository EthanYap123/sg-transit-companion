import { vi } from 'vitest';

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export function apiError(status: number, code: string, message = 'Failed'): Response {
  return json({ error: { code, message, requestId: 'test' } }, status);
}

/** Replaces fetch. `reply` gets the request path and returns the response, or throws for no answer. */
export function fakeFetch(reply: (path: string) => Response | Promise<Response>) {
  const mock = vi.fn((url: string | URL | Request, init?: RequestInit) => {
    const path = String(url).replace('https://api.test', '');
    return new Promise<Response>((resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      Promise.resolve()
        .then(() => reply(path))
        .then((response) => resolve(response.clone()), reject);
    });
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

/** A reply that never arrives, like a server that is still waking up. */
export const never = () => new Promise<Response>(() => undefined);
