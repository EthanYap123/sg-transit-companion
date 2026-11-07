import { jwtVerify } from 'jose';
import { z } from 'zod';

export const API_TOKEN_ISSUER = 'sg-transit-web';
export const API_TOKEN_AUDIENCE = 'sg-transit-api';

const claimsSchema = z.object({
  sub: z.string().regex(/^[a-z]+:[A-Za-z0-9_-]{1,100}$/),
  name: z.string().max(200).nullish(),
  email: z.email().max(320).nullish(),
  picture: z
    .url({ protocol: /^https$/ })
    .max(2_000)
    .nullish(),
});

/** Who a valid API token says the caller is. */
export interface ApiIdentity {
  authSubject: string;
  name: string | null;
  email: string | null;
  imageUrl: string | null;
}

/**
 * Checks a token from the web app's /api/token route (docs/adr/0004-github-sign-in-with-authjs.md, provider in 0005):
 * signed with the shared secret using HS256, not expired, and meant for this API. Returns null for
 * anything else. The algorithm is fixed so a token cannot choose a weaker one or "none".
 */
export async function verifyApiToken(token: string, secret: string): Promise<ApiIdentity | null> {
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ['HS256'],
      issuer: API_TOKEN_ISSUER,
      audience: API_TOKEN_AUDIENCE,
      requiredClaims: ['exp', 'sub'],
    });
    const claims = claimsSchema.safeParse(payload);
    if (!claims.success) return null;
    return {
      authSubject: claims.data.sub,
      name: claims.data.name ?? null,
      email: claims.data.email ?? null,
      imageUrl: claims.data.picture ?? null,
    };
  } catch {
    return null;
  }
}
