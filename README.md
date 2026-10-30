# SG Transit Companion

A mobile-first PWA for live Singapore bus arrival times, built on the LTA DataMall API: search stops, save favourites, find stops near you, and get a "leave now" push alert before your bus arrives.

> Status: **Phase 0 — requirements and design.** No app code yet.

## Documentation

| Doc                                  | What it covers                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| [PRD](docs/PRD.md)                   | Problem, users, user stories with acceptance criteria, priorities, out of scope |
| [Architecture](docs/ARCHITECTURE.md) | System diagram, data flow, caching, LTA failure handling, free-tier design      |
| [Data model](docs/ERD.md)            | Entity-relationship diagram and table rules                                     |
| [API contract](docs/API.md)          | Every endpoint, request, response and error                                     |
| [Costs](docs/COSTS.md)               | Free-tier limits of every service and what happens when they are exceeded       |
| [ADRs](docs/adr/)                    | Key architecture decisions and the alternatives considered                      |

## Built to run for free

Every service runs on a free tier with no credit card. Limits and what happens when they are hit are tracked in [`docs/COSTS.md`](docs/COSTS.md).

### Free-tier trade-offs

- **Cold starts.** The API runs on Render's free plan, which sleeps after 15 minutes without traffic and takes about a minute to wake. The app shows a "waking up the server" message and retries, and the alert scheduler wakes the API a few minutes before an alert is due.
- **Shared server hours.** Render gives 750 free hours a month across all services, so staging is only woken by deploys and production sleeps overnight. No uptime pinger keeps it awake.
- **Redis command cap.** Upstash's free plan allows 500K commands a month, shared by staging and production. Arrivals are cached in memory first; Redis only keeps data that should survive a restart and is written at most once a minute per stop. The API still works if Redis is unavailable.
- **Database sleeps too.** Neon's free Postgres scales to zero, so stop search and "nearby" run on an in-memory index and only signed-in features touch the database.

## License

[MIT](LICENSE)
