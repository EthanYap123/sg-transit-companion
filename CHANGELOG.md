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

### Changed

- TypeScript pinned to 6.0 so typescript-eslint can lint with type information (#17)
