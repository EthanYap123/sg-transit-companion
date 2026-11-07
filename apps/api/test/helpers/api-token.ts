import { randomBytes } from 'node:crypto';
import { SignJWT, type JWTPayload } from 'jose';

/** Random for each test run, so no secret-looking value is ever committed. */
export const TEST_JWT_SECRET = randomBytes(32).toString('base64');

export interface TokenOptions {
  secret?: string;
  issuer?: string;
  audience?: string;
  expiresIn?: string;
  subject?: string | null;
}

/** Signs a token the way the web app's /api/token route does. */
export function signApiToken(claims: JWTPayload = {}, options: TokenOptions = {}): Promise<string> {
  const {
    secret = TEST_JWT_SECRET,
    issuer = 'sg-transit-web',
    audience = 'sg-transit-api',
    expiresIn = '15m',
    subject = 'google:1234567',
  } = options;
  let jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expiresIn);
  if (subject) jwt = jwt.setSubject(subject);
  return jwt.sign(new TextEncoder().encode(secret));
}
