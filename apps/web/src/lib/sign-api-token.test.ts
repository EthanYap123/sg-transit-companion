// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { decodeJwt, jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';
import { signApiToken } from './sign-api-token';

const secret = randomBytes(32).toString('base64');
const key = new TextEncoder().encode(secret);

describe('signApiToken', () => {
  it('signs the token the API expects', async () => {
    const { token } = await signApiToken(
      { subject: 'google:1', name: 'Ethan', email: null, picture: 'https://example.com/a.png' },
      secret,
    );

    const { payload, protectedHeader } = await jwtVerify(token, key, {
      issuer: 'sg-transit-web',
      audience: 'sg-transit-api',
      algorithms: ['HS256'],
    });

    expect(protectedHeader.alg).toBe('HS256');
    expect(payload).toMatchObject({
      sub: 'google:1',
      name: 'Ethan',
      email: null,
      picture: 'https://example.com/a.png',
    });
  });

  it('lasts 15 minutes and reports when it expires', async () => {
    const now = Date.parse('2026-11-07T08:00:00Z');

    const { token, expiresAt } = await signApiToken({ subject: 'google:1' }, secret, now);

    expect(expiresAt).toBe(now + 15 * 60_000);
    expect(decodeJwt(token).exp).toBe(expiresAt / 1000);
  });

  it('cannot be read as valid with another secret', async () => {
    const { token } = await signApiToken({ subject: 'google:1' }, secret);
    const other = new TextEncoder().encode(randomBytes(32).toString('base64'));

    await expect(jwtVerify(token, other)).rejects.toThrow();
  });
});
