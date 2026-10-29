# 0002. Run the API as a separate Express service

- Status: Accepted
- Date: 2026-10-29
- Related: [ARCHITECTURE.md §1, §6–7](../ARCHITECTURE.md)

## Context

Next.js can serve API routes itself (route handlers on Vercel functions), which would mean one app and one deployment. But this API has needs that fit serverless functions poorly:

- **Long-lived memory**: the two-level cache (ADR 0001), single-flight LTA calls, the in-memory stop index and in-memory rate limiting all depend on a process that stays up between requests. Serverless functions start cold and do not share memory.
- **Background-style work**: the alert engine, weekly stop sync and Web Push sending.
- **Free-tier fit**: Vercel Hobby includes 4 hours of Active CPU a month. Proxying every 20-second arrivals refresh through functions would spend that on network waiting and JSON work. Vercel Hobby is also non-commercial, so keeping the backend portable avoids lock-in.
- **Learning goals**: the project should show a containerised service with its own CI/CD, migrations and health checks.

## Decision

Build the backend as a **standalone Express (TypeScript) service** in `apps/api`, packaged as a Docker image, pushed to GHCR and run on Render Free. The Next.js app in `apps/web` handles UI and Auth.js only, and the browser calls the API directly (CORS). The API owns the database schema and migrations.

## Alternatives considered

| Option | Pros | Cons |
| --- | --- | --- |
| Next.js route handlers on Vercel | One deploy, no CORS, no cold-start sleep | No shared memory for caching; Active CPU cap; DB connections from many short-lived functions; ties backend to Vercel |
| Next.js server on Render (one container for both) | One service, shared memory | Loses Vercel's CDN and preview deployments; one Render service doing everything wakes slower and uses more of 750 h |
| Serverless API (Cloudflare Workers) | No sleep, generous free requests | 10 ms CPU limit; no ioredis/Prisma TCP without extra adapters; no long-lived memory |
| **Express on Render + Next.js on Vercel (chosen)** | Right runtime for each part; portable Docker image; clear API contract | Render Free sleeps (cold starts); CORS and token exchange to manage; two deploy targets |

## Consequences

- The web app needs a "waking up" state and retries (PRD US-05), and alerts need a pre-wake (ADR 0003).
- Auth crosses two services: Auth.js issues a short-lived HS256 API token that the API verifies with a shared secret. Both services must keep that secret in step.
- The API contract ([API.md](../API.md)) becomes the boundary; integration tests target it with Supertest.
- The API image can move to any container host (Fly.io, Koyeb, a VPS) without code changes if Render's free tier changes.
- Two Render services (staging + production) share one 750-hour monthly allowance, which shapes the environment plan in Phase 4.
