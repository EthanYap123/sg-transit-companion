# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Cost plan with confirmed free-tier limits for every service, and free-tier trade-offs in the README (#2)
- Product requirements with user stories, acceptance criteria and MoSCoW priorities (#1)
- System architecture: diagrams, cache and TTL strategy, LTA failure handling and free-tier design (#3)
- Data model (ERD) with table rules and size estimate (#4)
- API contract for public, user and internal endpoints (#5)
- ADRs 0001-0003: two-level cache, separate Express API, Cloudflare cron for alerts (#6)
- npm workspaces monorepo with an Express API skeleton (`GET /health`) and a Next.js web skeleton, each with tests (#15)
- Docker Compose for local Postgres 16 and Redis 7, and `.env.example` files for the root, API and web (#16)
- ESLint (typescript-eslint with type info for the API, Next.js rules for the web), Prettier, Husky pre-commit (lint-staged) and commit-msg (commitlint) hooks (#17)
- CI on every pull request: lint and format, typecheck, unit tests, build, gitleaks secret scan, Docker Compose health check and PR-title commitlint; CI badge in the README (#18)
- Pull request template, bug and feature issue forms, CONTRIBUTING.md with the definition of done and branch protection rules, and local setup in the README (#19)
- LTA DataMall client for Bus Arrival v3 and paged Bus Stops: 5 s timeout, one retry with jitter, circuit breaker, 60 s pause on HTTP 429, zod-validated responses, recorded fixtures (#28)
- Bus arrivals normaliser: natural service order, soonest-first buses, minutes away, readable load and deck values, schedule-based times flagged (#29)
- Arrivals cache: 20 s in memory, one shared LTA call per stop, Redis snapshot at most once a minute, stale data up to 10 minutes when LTA is down, daily Redis command budget, works without Redis (#30)
- Bus stops: Prisma schema and migration, weekly-ready sync from LTA (one upsert for ~5,200 stops), Redis snapshot and boot-time index load, in-memory search by code, name and road with abbreviation handling, protected `POST /internal/stops/sync` (#31)
- Public API routes: `GET /v1/stops/search`, `/v1/stops/{code}` and `/v1/stops/{code}/arrivals` with zod validation, one error shape with request ids, CORS for the web origin, cache headers, and Redis/stop index/LTA status in `/health` (#32)
- API coverage gate: CI fails under 70% lines, branches, functions or statements, and shows a coverage table on each run (#35)
- Web: stop search page with 300 ms debounce and empty, error and waking-server states; light theme by default with a sun/moon toggle and Light/Dark/Match device setting; responsive layout (#33)
- Web: live arrivals page with the next 3 buses per service, crowding, deck and wheelchair labels, scheduled marker, countdown, refresh about every 20 s (timed from `fetchedAt`, paused when hidden), and stale, LTA-down, no-buses, not-found and waking-server states (#34)
- API rate limits: 60 requests/min per client on stop routes and 10/min on internal routes, with `RateLimit-*` headers, `429 RATE_LIMITED`, `Retry-After`, and a clear message in stop search (#45)
- GitHub OAuth setup guide, with confirmed limits in the cost plan (#46)
- API accounts: `users` table, Bearer API token check (HS256, 15 minutes, issuer and audience), `GET` and `DELETE /v1/me`, per-user rate limits and a failed-attempt limit (#47)
- Web sign-in with GitHub through Auth.js: `/api/token` for the short-lived API token (kept in memory only), sign in in the header, and a settings page to sign out or delete the account (#48)
- Favourite stops API: `favourite_stops` table, list, save, rename, reorder and remove under `/v1/me/favourites`, up to 20 per user, each user limited to their own rows (#49)
- Web: save a stop from its arrivals page (sign-in offered when signed out), "Your stops" on the home screen with live times for the first three, and an editor to rename, reorder and remove saved stops with a 20-stop counter (#50)
- Nearby stops API: `GET /v1/stops/nearby` finds up to 20 stops within 100–1000 m of a point in Singapore, nearest first with distances in metres, from the in-memory index; coordinates are never logged, stored or cached (#51)
- Web: "Stops near you" on the home screen. "Use my location" lists up to 10 stops within 500 m with their distance. The browser only asks for location after the tap, and denied, unavailable, slow, unsupported and outside-Singapore cases each get a clear message pointing to search (#52)
- Production Docker image for the API: multi-stage build, production dependencies only (no Prisma CLI, no web packages), non-root user, commit shown by `/health`, and a `.dockerignore` that keeps env files out (#65)
- API image workflow: builds the image on pull requests that touch the API, smoke tests it against a throwaway Postgres (`/health` commit, stop search), and pushes it to GitHub Container Registry on merges to `main` (`main`, `sha-<commit>`) and release tags (`1.2.3`, `1.2`) (#66)
- Hosted Postgres on Neon Free (Singapore, Postgres 16): `production` and `staging` branches with all migrations applied, production loaded with the bus stop table, and each branch's direct connection string kept as a GitHub environment secret for deploys (#67)
- Hosted Redis on Upstash Free (Singapore, TLS, eviction on), shared by staging (`stg:`) and production (`prod:`); the API image was checked against it with both prefixes (#68)
- API: `GET /internal/client-ip` (behind `CRON_SECRET`) shows the caller's address as rate limits see it, the raw `X-Forwarded-For` and the `TRUST_PROXY` value, to set and check `TRUST_PROXY` on a host (#69)
- API hosted on Render Free in Singapore: `sg-transit-api-staging` (image `main`) and `sg-transit-api` (fixed image tag), both from the public GHCR image with `/health` checks, Neon and Upstash connections, and `TRUST_PROXY=3` verified against spoofed `X-Forwarded-For` (#69)

### Changed

- API: one shared validation helper for path, query and body values (#44)
- TypeScript pinned to 6.0 so typescript-eslint can lint with type information (#17)
- Sign-in now uses Google instead of GitHub, since commuters rarely have GitHub accounts. It asks only for name and picture, so no email address is received (#58)

### Fixed

- API: a body over 100 KB now answers 413 instead of claiming it is not valid JSON (#44)
