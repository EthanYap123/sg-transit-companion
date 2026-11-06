# SG Transit Companion

[![CI](https://github.com/EthanYap123/sg-transit-companion/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/EthanYap123/sg-transit-companion/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A mobile-first PWA for live Singapore bus arrival times, built on the LTA DataMall API: search stops, save favourites, find stops near you, and get a "leave now" push alert before your bus arrives.

> Status: **Phase 2 — core MVP complete.** Search any Singapore bus stop and watch live arrivals, running locally. Accounts, deployment and alerts come in later phases.

## Repository layout

```
apps/
  api/   Express + TypeScript API (Vitest + Supertest)
  web/   Next.js App Router + TypeScript web app
docs/    PRD, architecture, data model, API contract, costs, ADRs
docker-compose.yml   local Postgres 16 and Redis 7
```

## Run locally

Requires Node.js 22, Docker, and a free [LTA DataMall](https://datamall.lta.gov.sg/content/datamall/en/request-for-api.html) account key in `apps/api/.env` (copy `apps/api/.env.example`).

```bash
npm ci
docker compose up -d --wait   # Postgres on localhost:5433, Redis on localhost:6379
npm run db:deploy -w apps/api # apply database migrations
npm run dev:api               # http://localhost:4000/health
npm run dev:web               # http://localhost:3000 (the app)
```

`npm run lint`, `npm run typecheck`, `npm test` and `npm run build` run the same checks as CI. See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch, commit and review workflow.

## Documentation

| Doc                                        | What it covers                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| [PRD](docs/PRD.md)                         | Problem, users, user stories with acceptance criteria, priorities, out of scope |
| [Architecture](docs/ARCHITECTURE.md)       | System diagram, data flow, caching, LTA failure handling, free-tier design      |
| [Data model](docs/ERD.md)                  | Entity-relationship diagram and table rules                                     |
| [API contract](docs/API.md)                | Every endpoint, request, response and error                                     |
| [GitHub OAuth setup](docs/GITHUB_OAUTH.md) | Creating the sign-in app and filling in local env files                         |
| [Costs](docs/COSTS.md)                     | Free-tier limits of every service and what happens when they are exceeded       |
| [ADRs](docs/adr/)                          | Key architecture decisions and the alternatives considered                      |

## Built to run for free

Every service runs on a free tier with no credit card. Limits and what happens when they are hit are tracked in [`docs/COSTS.md`](docs/COSTS.md).

### Free-tier trade-offs

- **Cold starts.** The API runs on Render's free plan, which sleeps after 15 minutes without traffic and takes about a minute to wake. The app shows a "waking up the server" message and retries, and the alert scheduler wakes the API a few minutes before an alert is due.
- **Shared server hours.** Render gives 750 free hours a month across all services, so staging is only woken by deploys and production sleeps overnight. No uptime pinger keeps it awake.
- **Redis command cap.** Upstash's free plan allows 500K commands a month, shared by staging and production. Arrivals are cached in memory first; Redis only keeps data that should survive a restart and is written at most once a minute per stop. The API still works if Redis is unavailable.
- **Database sleeps too.** Neon's free Postgres scales to zero, so stop search and "nearby" run on an in-memory index and only signed-in features touch the database.

## License

[MIT](LICENSE)
