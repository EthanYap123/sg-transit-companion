# 0004. Sign in with GitHub through Auth.js and short-lived API tokens

- Status: Accepted, except the provider choice, superseded by [ADR 0005](0005-sign-in-with-google.md)
- Date: 2026-11-07
- Related: [ARCHITECTURE.md §6](../ARCHITECTURE.md#6-authentication-and-security-boundaries), ADR 0002, issues #47 and #48

## Context

Favourites and alerts need accounts. The web app runs on Vercel and the API on Render (ADR 0002), so sign-in crosses two services on different domains, and a session cookie set by one is not sent to the other. The API sleeps and Neon scales to zero on their free plans, so anonymous traffic must not touch the database. The project also should not store passwords or send email, since a free email service is one more limit to manage.

## Decision

- **Auth.js v5 in the Next.js app** with GitHub as the only provider and encrypted JWT sessions, so the web app needs no database.
- **A 15-minute API token.** `GET /api/token` on the web app turns the session into an HS256 token (`iss=sg-transit-web`, `aud=sg-transit-api`, `sub=github:<id>`). The browser holds it in memory only and sends it as a Bearer token. The API checks it with a secret shared only by the two services.
- **The API owns users.** It creates the row the first time it sees a valid token (`GET /v1/me`). `sub` is `<provider>:<id>`, so another provider can be added without a migration.
- **Only the `read:user` scope.** GitHub is not asked for private email addresses, matching the PRD: profile data only, email only if public.

## Alternatives considered

| Option                                                 | Pros                                                                                       | Cons                                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| **Auth.js v5 + API token (chosen)**                    | Well-known OAuth handling; no passwords; no database in the web app; API stays independent | v5 is still published under npm's `beta` tag; a shared secret to keep in step           |
| Auth.js v4 (npm `latest`)                              | Marked stable                                                                              | Older API built around the Pages Router; the Auth.js docs install v5 for the App Router |
| Better Auth                                            | Actively developed; Auth.js now points to it                                               | Wants a database connection in the web app, against ADR 0002                            |
| Hand-written GitHub OAuth                              | No dependency                                                                              | Security-sensitive code (state, CSRF, cookie encryption) to write and maintain          |
| Email and password                                     | Works without a GitHub account                                                             | Password storage, reset emails and a mail service; a Could in the PRD                   |
| Web app proxies every API call with the session cookie | No token in the browser                                                                    | Every call uses Vercel function time, against the free-tier design in ADR 0002          |

## Consequences

- Auth.js is pinned to an exact beta version. Only `apps/web/src/auth.ts` and the `/api/token` route depend on it, and the API only knows about tokens, so replacing it later would be contained.
- A stolen API token works for at most 15 minutes. It is never stored in `localStorage`.
- A signed-out session can still use a token for up to 15 minutes. Deleting an account clears the token in that browser.
- `API_JWT_SECRET` must match in both services. A mismatch shows up as 401 from the API.
- People without a GitHub account cannot save stops. Search and arrivals need no account.
