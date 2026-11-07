import { SignJWT } from 'jose';

const LIFETIME_SECONDS = 15 * 60;

export interface ApiTokenClaims {
  subject: string;
  name?: string | null;
  email?: string | null;
  picture?: string | null;
}

/** Signs the 15-minute token the API checks in src/auth/api-token.ts. Server side only. */
export async function signApiToken(claims: ApiTokenClaims, secret: string, now = Date.now()) {
  const issuedAt = Math.floor(now / 1000);
  const expiresAt = issuedAt + LIFETIME_SECONDS;
  const token = await new SignJWT({
    name: claims.name ?? null,
    email: claims.email ?? null,
    picture: claims.picture ?? null,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('sg-transit-web')
    .setAudience('sg-transit-api')
    .setSubject(claims.subject)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(new TextEncoder().encode(secret));
  return { token, expiresAt: expiresAt * 1000 };
}
