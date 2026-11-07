import { SignJWT, UnsecuredJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { verifyApiToken } from '../../src/auth/api-token.js';
import { signApiToken, TEST_JWT_SECRET } from '../helpers/api-token.js';

const verify = (token: string) => verifyApiToken(token, TEST_JWT_SECRET);

describe('verifyApiToken', () => {
  it('accepts a valid token and reads the profile', async () => {
    const token = await signApiToken({
      name: 'Ethan',
      email: 'ethan@example.com',
      picture: 'https://lh3.googleusercontent.com/a/1',
    });

    await expect(verify(token)).resolves.toEqual({
      authSubject: 'google:1234567',
      name: 'Ethan',
      email: 'ethan@example.com',
      imageUrl: 'https://lh3.googleusercontent.com/a/1',
    });
  });

  it('treats a missing profile as empty, not invalid', async () => {
    const token = await signApiToken({ name: null, email: null });

    await expect(verify(token)).resolves.toEqual({
      authSubject: 'google:1234567',
      name: null,
      email: null,
      imageUrl: null,
    });
  });

  it.each([
    ['is expired', { expiresIn: '-1s' }],
    ['is signed with another secret', { secret: 'a-completely-different-secret-value-here' }],
    ['comes from another issuer', { issuer: 'someone-else' }],
    ['is meant for another service', { audience: 'other-api' }],
    ['has no subject', { subject: null }],
    ['has a malformed subject', { subject: 'not a subject' }],
  ])('rejects a token that %s', async (_label, options) => {
    await expect(verify(await signApiToken({}, options))).resolves.toBeNull();
  });

  it('rejects a token with no expiry', async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('sg-transit-web')
      .setAudience('sg-transit-api')
      .setSubject('google:1')
      .sign(new TextEncoder().encode(TEST_JWT_SECRET));

    await expect(verify(token)).resolves.toBeNull();
  });

  it('rejects an unsigned token, even with the right claims', async () => {
    const token = new UnsecuredJWT({})
      .setIssuer('sg-transit-web')
      .setAudience('sg-transit-api')
      .setSubject('google:1')
      .setExpirationTime('15m')
      .encode();

    await expect(verify(token)).resolves.toBeNull();
  });

  it('rejects a stronger-looking algorithm it was not told to accept', async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS512' })
      .setIssuer('sg-transit-web')
      .setAudience('sg-transit-api')
      .setSubject('google:1')
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode(TEST_JWT_SECRET.repeat(2)));

    await expect(verifyApiToken(token, TEST_JWT_SECRET.repeat(2))).resolves.toBeNull();
  });

  it('rejects garbage and bad profile values', async () => {
    await expect(verify('not.a.token')).resolves.toBeNull();
    await expect(verify(await signApiToken({ picture: 'javascript:alert(1)' }))).resolves.toBeNull();
    await expect(verify(await signApiToken({ picture: 'http://example.com/a.png' }))).resolves.toBeNull();
    await expect(verify(await signApiToken({ email: 'nope' }))).resolves.toBeNull();
    await expect(verify(await signApiToken({ picture: 'not a url' }))).resolves.toBeNull();
  });

  it('accepts nothing when no secret is configured', async () => {
    await expect(verifyApiToken(await signApiToken(), '')).resolves.toBeNull();
  });
});
