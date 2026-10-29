# 0001. Cache LTA data in memory and Redis

- Status: Accepted
- Date: 2026-10-29
- Related: [ARCHITECTURE.md §3–4](../ARCHITECTURE.md#3-cache-and-ttl-strategy), [COSTS.md](../COSTS.md)

## Context

Every arrivals screen refreshes every 20 seconds, and many users may look at the same busy stop. Calling LTA DataMall for every request would:

- send identical requests (LTA only updates Bus Arrival every 20 s),
- make every response as slow as LTA, and fail whenever LTA fails,
- risk LTA's call threshold and any unpublished rate limit on our single account key.

The API runs on Render Free, which sleeps after 15 minutes and may restart at any time, so anything held only in process memory is lost often. Upstash Redis Free gives one database with **500K commands per month**, shared by staging and production, so Redis cannot be used naively on every request either.

## Decision

Use a **two-level cache**:

1. **L1, in-process memory** (LRU): normalised arrivals, fresh for 20 s and kept up to 10 minutes as a stale fallback; the full bus stop index. Concurrent misses for the same stop share one LTA call (single-flight).
2. **L2, Upstash Redis**: last-known-good arrivals (`EX 600`, written at most once per 60 s per stop), the bus stop snapshot and the alert schedule. It is read on the first request for a stop after boot, and when LTA fails and memory has no stale copy.

A command budget guard stops optional Redis writes past a daily ceiling, and the API keeps working if Redis is unavailable.

## Alternatives considered

| Option | Pros | Cons |
| --- | --- | --- |
| No cache, call LTA every time | Simplest; always fresh | Slow, fragile, wasteful; outage = no data; risks the LTA key |
| Memory cache only | Free, fastest, no command cap | Lost on every Render sleep/restart: cold start has no stale fallback and must re-page 5,000 stops from LTA |
| Redis on every request (classic cache-aside) | Standard pattern, shared across instances | ~2 commands per request; a few active users would use the 500K monthly cap in days |
| Postgres as the cache | Already have it | Wakes Neon on every request (burns CU-hours, adds cold-start latency); wrong tool for TTL data |
| **Memory first, Redis for cross-restart data (chosen)** | Fast, resilient to LTA outages and API restarts, fits the command cap | More moving parts; two TTLs to reason about; needs tests with fake timers |

## Consequences

- Arrivals are at most ~20 s older than LTA's own data when LTA is up, and up to 10 minutes old (clearly flagged) when it is down.
- LTA is called at most once per stop per 20 s regardless of user count.
- Estimated Redis use is ~72K commands/month (about 15% of the cap), leaving room for staging and spikes.
- With more than one API instance, L1 would differ between instances; acceptable now (Render Free is single-instance). Scaling out would mean reading Redis first and moving rate limiting to Redis.
- Cache behaviour needs dedicated unit tests (freshness, stale fallback, single-flight, write throttle, budget guard).
