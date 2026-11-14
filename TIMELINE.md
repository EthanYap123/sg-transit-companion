# SG Transit Companion Timeline

Last updated: 2026-11-14

## ✅ Phase 0: Requirements & Design (29 Oct)

PRD, architecture, data model, API contract, cost plan and ADRs 0001-0003.

- [x] Part 1: PRD and cost plan with free-tier limits
- [x] Part 2: Architecture, ERD, API contract and ADRs

## ✅ Phase 1: Repo setup & CI (30 Oct)

npm workspaces monorepo, local Docker services, linting, hooks, CI and branch protection.

- [x] Part 1: Monorepo skeleton, Docker Compose and env examples
- [x] Part 2: ESLint, Prettier, Husky and commitlint
- [x] Part 3: CI checks, templates, contributing guide and branch protection

## ✅ Phase 2: Core MVP (31 Oct - 4 Nov)

LTA client, arrivals cache, stop search and the live arrivals UI.

- [x] Part 1: LTA DataMall client and arrivals normaliser (31 Oct)
- [x] Part 2: Arrivals cache and bus stop sync and search (1 Nov)
- [x] Part 3: Public API routes and coverage gate (2 Nov)
- [x] Part 4: Stop search page and live arrivals page (4 Nov)

## ✅ Phase 3: Accounts & personalisation (6 - 10 Nov)

Rate limits, Google sign-in, favourite stops and nearby stops.

- [x] Part 1: Rate limits and shared validation (6 Nov)
- [x] Part 2: Google sign-in and accounts (7 Nov)
- [x] Part 3: Favourite stops, API and web (8 Nov)
- [x] Part 4: Nearby stops, API and web (10 Nov)

## 🔨 Phase 4: Deployment & CD

Staging and production on Render, Vercel, Neon and Upstash, deployed automatically from GitHub Actions. Issues #65-#73.

- [x] Part 1: Phase 4 issues, API Dockerfile and image build pushed to GHCR (12 Nov)
- [x] Part 2: Neon (production and staging branches, migrations) and Upstash Redis, limits recorded in COSTS.md (14 Nov)
- [x] Part 3: Render staging and production API services (card check, image deploy or Dockerfile fallback, TRUST_PROXY, env vars) (14 Nov)
- [ ] Part 4: Vercel web for staging and production, production Google OAuth client and privacy policy page, CORS
- [ ] Part 5: CD workflow (staging on merge to main, production on v* tags), migrations, smoke tests, docs and manual checks including nearby stops on a phone

## ⬜ Phase 5: PWA, notifications & hardening

Installable PWA, "leave now" push alerts, error tracking and a security and dependency pass.

- [ ] Part 1: Web app manifest, service worker and offline last-known arrivals
- [ ] Part 2: Alerts and push subscriptions API with VAPID
- [ ] Part 3: Alerts UI and push notifications in the web app
- [ ] Part 4: Cloudflare Worker cron for alert ticks and pre-waking the API
- [ ] Part 5: Sentry, dependency audit and security hardening

## ⬜ Phase 6: Release

End-to-end checks and the v1.0.0 release.

- [ ] Part 1: End-to-end tests, accessibility and performance pass
- [ ] Part 2: v1.0.0 tag, release notes and final README

## ⬜ Phase 7: Portfolio

Add the project to the portfolio site.

- [ ] Part 1: Screenshots and project write-up
- [ ] Part 2: Portfolio card linking the live app and repo
