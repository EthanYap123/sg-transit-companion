# Costs and free-tier limits

**Budget: $0.** Every service below is used on a free tier that needs no credit card. If a service ever asks for payment details or a paid plan to do something this project needs, work stops and the design changes instead.

Limits were checked against each provider's own pages on **29 Oct 2026**. Providers change these often, so re-check before each phase that adds a service and update the "Checked" column.

## Summary

| Service | Purpose | Free-tier limits that matter here | What happens when exceeded | Checked |
| --- | --- | --- | --- | --- |
| **LTA DataMall** | Source of bus arrivals, bus stops, routes | Free account key. ToS threshold of 10 million calls per day. Bus Arrival updates every 20 s. Bulk datasets return 500 records per call (page with `$skip`). | LTA may suspend or terminate the key without warning. | [ToS](https://datamall.lta.gov.sg/content/datamall/en/api-terms-of-service.html), [User Guide v6.10](https://datamall.lta.gov.sg/content/dam/datamall/datasets/LTA_DataMall_API_User_Guide.pdf) |
| **Vercel Hobby** | Next.js frontend (production + preview deployments) | 100 GB Fast Data Transfer, 1M function invocations, 4 h Active CPU, 360 GB-h provisioned memory, 10 GB Fast Origin Transfer, 5K image transformations per month. 100 deployments per day. Runtime logs kept 1 hour. **Non-commercial personal use only.** | Hobby has no pay-as-you-go: Vercel notifies you and can pause the project until the next cycle. | [Limits](https://vercel.com/docs/limits), [Fair use](https://vercel.com/docs/limits/fair-use-guidelines) |
| **Render Free web service** | Express API, deployed from a Docker image (one service for production, one for staging) | Spins down after **15 min** with no inbound traffic; spin-up takes **about 1 minute**. **750 instance hours per workspace per month**, shared by all free services. No persistent disk, single instance, may be restarted at any time. Cannot send mail on ports 25/465/587. Outbound bandwidth and build minutes count against the workspace's monthly allowance. | Hours used up: **all free services suspended until next month.** Bandwidth over: without a card, all free services suspended for the month. Build minutes over: new builds disabled (running services keep going). | [Free instances](https://render.com/docs/free), [Deploying an image](https://render.com/docs/deploying-an-image) |
| **Neon Free** | PostgreSQL (users, favourites, alerts, push subscriptions, bus stop table) | **1 GB storage per project**, 100 CU-hours per project per month, autoscaling up to 2 CU, **scales to zero after 5 min idle (always on)**, 5 GB egress, **10 branches per project**. No card, permanent plan. | CU-hours or egress used up: compute suspended until next period. Storage over: writes blocked. Branch limit: no new branches. Data is never deleted. | [Pricing](https://neon.com/pricing) |
| **Upstash Redis Free** | Shared cache (last-known-good arrivals, bus stop snapshot, alert schedule) | **500K commands per month**, 256 MB data, 10 GB bandwidth per month, **1 free database per account**, 10K commands/s, 10 MB max request. No card. | Not stated for the free tier; treat it as requests being rejected for the rest of the month. The API must keep working without Redis (see [Architecture](ARCHITECTURE.md#redis-command-budget)). | [Pricing](https://upstash.com/pricing/redis) |
| **Cloudflare Workers Free** | Cron trigger that drives "leave now" alerts | 100,000 requests per day (reset 00:00 UTC), **10 ms CPU per invocation** (including each cron run), **5 cron triggers per account**, 50 subrequests per invocation. | Requests over: error 1027. CPU over: error 1102, invocation fails. Raising either needs the paid plan. | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) |
| **Sentry Developer** | Error tracking for web and API | 1 user, 5K errors, 5M tracing spans, 50 session replays, 30-day retention. | "Events … that exceed your quota will not be accepted." Errors are dropped, the app is unaffected. | [Pricing](https://sentry.io/pricing/), [Quotas](https://docs.sentry.io/pricing/quotas/) |
| **GitHub Actions** | CI (lint, typecheck, tests, build, gitleaks, E2E) and CD | Standard GitHub-hosted runners are **free and unmetered for public repositories**. Artifact storage shares the Packages storage pool. | n/a for public repos on standard runners. Keep artifacts small and short-lived. | [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions) |
| **GitHub Container Registry** | Stores the API Docker image that Render pulls | Free for public packages (storage and transfer). GHCR storage and bandwidth are "currently free" with at least one month's notice before any change. | n/a while the package is public. | [Packages billing](https://docs.github.com/en/billing/concepts/product-billing/github-packages) |
| **gitleaks** (GitHub Action) | Secret scanning in CI | Free; no licence key needed for repos under a personal account. | n/a | [gitleaks-action](https://github.com/gitleaks/gitleaks-action) |
| **GitHub OAuth app** | Sign-in provider for Auth.js | Free. | n/a | — |
| **Web Push (VAPID)** | "Leave now" notifications | Free: browsers' push services (FCM, Mozilla, Apple) deliver for free; VAPID keys are generated locally. | n/a | — |

Note on Neon: storage is **1 GB per project** (20 GB across all projects). The bus stop table (about 5,000 rows) plus user data is well under 50 MB.

## Not yet confirmed (check at sign-up, stop if a card is asked for)

These were not stated on the pages above. Each is checked the first time the service is set up, in the phase noted, and this file is updated.

| Item | Why it matters | When |
| --- | --- | --- |
| Render: no card needed to create a free web service | Zero-cost rule | Phase 4 |
| Render: a **free** instance can be image-backed (deployed from GHCR) | The CD plan deploys images, not source | Phase 4 (fallback: Render builds the same Dockerfile from the repo) |
| Render: Hobby workspace outbound bandwidth and build-minute amounts | Bandwidth over = all free services suspended | Phase 4 (read from the dashboard). Image deploys build in GitHub Actions, so Render build minutes are barely used. |
| Sentry: no card needed for the Developer plan | Zero-cost rule | Phase 5 |
| LTA DataMall: any per-minute rate limit on the account key | Only a daily threshold is published | Phase 2 (watch for HTTP 429 in logs) |

## How the design stays inside the limits

| Limit | Design response |
| --- | --- |
| Render 750 h/month shared by **two** services | Nothing keeps staging awake: it only wakes for deploy smoke tests. Production sleeps overnight unless an alert window is due. No uptime pinger. |
| Render 1-minute cold start | The web app shows a "waking the server" state and retries; the alert Worker pings `/health` 3 minutes before an alert window opens. |
| Upstash 500K commands/month, one database for both environments | Two-level cache: in-process memory first, Redis only for cross-restart data, written at most once a minute per stop. Keys are prefixed `prod:` / `stg:`. The API counts its own commands and stops optional Redis writes past a daily budget. |
| Neon 100 CU-hours, scale to zero | Bus stop search and nearby lookups use an in-memory index in the API, not the database. Only signed-in features touch Postgres. |
| Neon 10 branches | `main` (production) + `staging`, plus short-lived branches only for migration testing, deleted after use. |
| Workers 10 ms CPU, 5 crons | One cron, and the Worker does almost nothing: read one Redis key, compare times, maybe make one HTTP call. All alert logic is in the API. |
| Vercel non-commercial | No ads, payments or affiliate links. This is a personal portfolio project. |
| Vercel 4 h Active CPU | Public pages are mostly static/client-rendered. Arrivals are fetched by the browser directly from the API, not through Vercel functions. |

## If a limit is hit

| Event | User-visible effect | Recovery |
| --- | --- | --- |
| Render hours used up | API down until the 1st of next month; web shows "service unavailable" with the last arrivals cached in the browser. | Wait for reset, or temporarily stop the staging service. |
| Upstash quota used up | No effect on live arrivals (served from memory and LTA). Stale fallback after a cold start is lost; alerts pause. | Automatic at the monthly reset. |
| Neon compute suspended | Sign-in features (favourites, alerts) fail with a clear message; search and arrivals keep working. | Automatic at the monthly reset. |
| LTA key suspended | Arrivals unavailable; search still works from the stop index. | Contact LTA DataMall; review call volume. |
