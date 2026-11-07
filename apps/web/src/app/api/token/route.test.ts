// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { jwtVerify } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth } from '@/auth';
import { GET } from './route';

vi.mock('@/auth', () => ({ auth: vi.fn() }));

const secret = randomBytes(32).toString('base64');
const signedIn = (user: Record<string, unknown>) =>
  vi.mocked(auth as unknown as () => Promise<unknown>).mockResolvedValue({ user });

beforeEach(() => {
  vi.stubEnv('API_JWT_SECRET', secret);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/token', () => {
  it('turns a session into a token the API accepts, and is never cached', async () => {
    signedIn({ authSubject: 'google:1', name: 'Ethan', image: 'https://example.com/a.png' });

    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const { token, expiresAt } = (await res.json()) as { token: string; expiresAt: number };
    expect(expiresAt).toBeGreaterThan(Date.now());
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      issuer: 'sg-transit-web',
      audience: 'sg-transit-api',
    });
    expect(payload).toMatchObject({ sub: 'google:1', name: 'Ethan', picture: 'https://example.com/a.png' });
  });

  it('answers 401 when signed out', async () => {
    vi.mocked(auth as unknown as () => Promise<unknown>).mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('answers 401 for a session with no account identity', async () => {
    signedIn({ name: 'Ethan' });

    expect((await GET()).status).toBe(401);
  });

  it('answers 500, rather than signing with nothing, when the secret is missing', async () => {
    vi.stubEnv('API_JWT_SECRET', '');
    signedIn({ authSubject: 'google:1' });

    expect((await GET()).status).toBe(500);
  });
});
