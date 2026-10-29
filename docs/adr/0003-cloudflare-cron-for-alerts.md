# 0003. Trigger "leave now" alerts from a Cloudflare Worker cron

- Status: Accepted
- Date: 2026-10-29
- Related: [ARCHITECTURE.md §5](../ARCHITECTURE.md#5-leave-now-alerts), ADR 0002

## Context

Leave-now alerts must be checked about once a minute during each user's alert window. The API sleeps on Render Free after 15 minutes without inbound traffic, and a timer inside a sleeping process never fires. Something outside the API has to trigger the check and, if needed, wake the API first, all on a free tier.

## Decision

Use **one Cloudflare Worker with a cron trigger** (`* 21-23,0-15 * * *` UTC = every minute, 05:00–23:59 SGT). Each run reads a compact alert schedule from Redis. If an alert window is open or opens within 3 minutes, it calls `POST /internal/alerts/tick` on the API with a shared secret; otherwise it exits. All alert logic (ETA maths, dedupe, Web Push) stays in the API.

## Alternatives considered

| Option | Pros | Cons |
| --- | --- | --- |
| `setInterval` / node-cron inside the API | Simplest | Never runs while Render has the API asleep |
| GitHub Actions `schedule` | Free for public repos | Minimum 5-minute interval and often delayed by many minutes; too imprecise for "leave now" |
| Vercel Cron (Hobby) | Same platform as the web | Hobby cron jobs are limited to running once a day |
| External pinger keeping the API always awake | Easy | Burns ~744 of the 750 shared Render hours, leaving none for staging; misuse of the free tier |
| **Cloudflare Worker cron (chosen)** | Minute precision, free (well under 100K requests/day), runs even when the API sleeps, wakes the API only when needed | One more platform and secret; Worker limited to 10 ms CPU, so it must stay trivial |

## Consequences

- The API sleeps whenever no one is using it and no alert window is near, protecting the shared Render hours.
- The 3-minute pre-wake absorbs Render's ~1 minute cold start. The first check in a window may still be late if Render is slow to start; the PRD target allows for this.
- The Worker reads Redis every minute in service hours (~35K commands/month), included in the Redis budget.
- No alerts can fire between 00:00 and 05:00 SGT; the alert form enforces windows inside service hours.
- The tick endpoint must be idempotent (unique `AlertDelivery` per bus) because cron runs can overlap or retry.
- Staging has no cron; its alert path is tested by calling the tick endpoint directly.
