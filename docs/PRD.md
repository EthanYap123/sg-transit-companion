# Product Requirements: SG Transit Companion

|              |                          |
| ------------ | ------------------------ |
| Owner        | Ethan Yap                |
| Status       | Draft for Phase 0 review |
| Last updated | 29 Oct 2026              |

## 1. Problem

Singapore commuters check bus arrival times many times a day, usually standing at a stop or about to leave home. Existing options work, but:

- Checking a regular stop means search, tap, wait, every single time.
- Arrival times tell you when the bus comes, not **when you should leave** to catch it. Commuters do the "ETA minus walking time" maths in their head, and miss buses.
- Many tools are heavy native apps; a quick check on a slow connection or a borrowed phone needs something light that opens instantly.

## 2. Goal

A fast, installable web app that answers **"when is my bus, and when do I need to leave?"** in one tap, using LTA's official real-time data, and that keeps running at zero cost.

### Success measures (for a portfolio project)

| Measure                                                                            | Target                                                        |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Time from opening the app to seeing arrivals for a favourite stop (warm API)       | < 2 s on a mid-range phone over 4G                            |
| Lighthouse (mobile) Performance / Accessibility / Best Practices / PWA-installable | ≥ 90 / ≥ 95 / ≥ 95 / installable                              |
| Arrival data freshness shown to users                                              | ≤ 40 s old when LTA is up                                     |
| "Leave now" alert sent before the computed leave time                              | ≥ 95% of alerts within 60 s of target (when the API is awake) |
| Running cost                                                                       | $0 / month                                                    |

## 3. Target users

| Persona                                                                 | Context                                                                      | Needs                                                                              |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Daily commuter** (student or worker, 16–45)                           | Same 2–4 stops every weekday, leaves home at roughly the same time           | One-tap arrivals for saved stops; a nudge when it is time to leave                 |
| **Occasional rider / visitor**                                          | Unfamiliar area, does not know stop codes                                    | Find stops near them on a map/list, search by road or landmark                     |
| **Accessibility-conscious rider** (wheelchair user, parent with a pram) | Needs to know if the next bus is wheelchair-accessible and how crowded it is | Clear WAB and crowding indicators, readable at a glance, works with screen readers |

## 4. User stories and acceptance criteria

IDs are referenced from issues and tests. Priority uses MoSCoW (section 5).

### Stops and arrivals

**US-01 — Search for a stop** (Must)
As a rider, I want to search by stop code, road name or landmark so that I can find a stop without knowing its code.

- Given I type a 5-digit code (e.g. `83139`), the matching stop is the first result.
- Given I type at least 2 characters of a road or description (e.g. `vic st`, `grand pac`), I see up to 20 matching stops, case-insensitive, each showing code, description and road.
- Results appear within 300 ms of typing stopping (debounced), and the search still works when LTA is down.
- An empty result shows "No stops match" and a tip to try the stop code.

**US-02 — See live arrivals** (Must)
As a rider, I want to see the next three buses for every service at a stop so that I can decide which to take.

- Each service shows the next 3 arrivals as minutes away ("Arr" when ≤ 1 min), ordered by service number.
- Each arrival shows crowding (Seats / Standing / Limited standing), wheelchair-accessible (WAB) and deck type, using text or icon + label (not colour alone).
- Arrivals that are schedule-based (LTA `Monitored = 0`) are visibly marked as "scheduled".
- The screen shows "Updated N s ago".

**US-03 — Auto-refresh** (Must)
As a rider waiting at a stop, I want arrivals to refresh by themselves so that I don't have to keep reloading.

- While the page is visible, arrivals refresh every 20 s; refresh pauses when the tab is hidden and resumes (with an immediate refresh) when it becomes visible.
- A manual "Refresh" control is available and announces the update to screen readers.
- A failed refresh keeps the last good data on screen and shows a non-blocking warning.

**US-04 — LTA downtime** (Must)
As a rider, I want to know when live data is unavailable so that I am not misled by old times.

- If LTA fails or times out, the API returns the last known arrivals (if under 10 minutes old) flagged as stale, and the UI shows "Live data unavailable — showing times from HH:MM".
- If there is no usable cached data, the UI shows "Live arrivals are temporarily unavailable" with a retry button, and the rest of the app (search, favourites) still works.
- Between about 00:00 and 05:30 when no buses run, an empty LTA response is shown as "No buses in service right now", not as an error.

**US-05 — Server waking up** (Must)
As a rider opening the app after a quiet period, I want to understand a slow first load so that I don't think the app is broken.

- If the API has not responded within 3 s, the UI shows "Waking up the server, this can take up to a minute" and keeps retrying with backoff for up to 90 s.

**US-06 — Responsive, mobile-first UI** (Must)

- Usable from 320 px wide with no horizontal scroll; tap targets ≥ 44 × 44 px.
- Works in light and dark mode; opens in light mode by default with a sun/moon toggle and a Light / Dark / Match device setting.
- Keyboard and screen-reader accessible (WCAG 2.2 AA colour contrast, visible focus, labelled controls).

### Personalisation

**US-07 — Sign in** (Must)
As a commuter, I want to sign in with GitHub so that my saved stops follow me across devices.

- "Sign in with GitHub" works on desktop and mobile; signing out clears the session on that device.
- Signed-out users can still search and see arrivals; only saving features ask to sign in.
- The app stores only GitHub user id, display name, avatar URL and email (if public). Users can delete their account and all data from Settings.

**US-08 — Save favourite stops** (Must)

- A signed-in user can star a stop from its arrivals page; it appears on the home screen.
- A user can rename a favourite (e.g. "Home", "School"), reorder favourites, and remove one.
- Up to 20 favourites per user; the 21st shows a clear limit message.
- The home screen shows live arrivals for the first 3 favourites without extra taps.

**US-09 — Nearby stops** (Should)
As a rider in an unfamiliar area, I want to see stops near me so that I can find the right one quickly.

- After I allow location, I see up to 10 stops within 500 m, sorted by distance, each with walking distance in metres.
- If I deny location, I see an explanation and the search box; the app never asks again unless I tap "Use my location".
- Location is used only in the browser request and is not stored on the server.

**US-10 — Offline and installable** (Should)

- The app can be installed to the home screen (valid manifest, icons, service worker).
- Offline, the app opens, shows saved favourites and the last arrivals seen with their timestamp, and says it is offline.

### "Leave now" alerts

**US-11 — Create a leave-now alert** (Should)
As a daily commuter, I want to be told when to leave home to catch my bus so that I don't wait at the stop or miss the bus.

- A signed-in user picks a stop, a service, walking time (1–30 min), days of the week, and a time window (e.g. 07:30–08:15, max 2 hours).
- Up to 5 alerts per user.
- The app asks for notification permission only when the user creates their first alert, explaining why first.

**US-12 — Receive a leave-now alert** (Should)

- During the window, when the next catchable bus's ETA minus walking time minus 1 minute buffer is reached, the user receives a push notification: "Leave now for 15 — arrives at Opp Blk 123 in 7 min".
- At most one notification per bus, and at most one every 5 minutes per alert.
- Tapping the notification opens that stop's arrivals.
- If the subscription is expired or rejected by the push service, it is removed after 3 consecutive failures.

**US-13 — Manage alerts** (Should)

- A user can pause, edit and delete alerts, and send themselves a test notification.

### Could

**US-14 — Service route view** (Could): tap a service to see its stops in order.
**US-15 — Bus location on a map** (Could): show the next bus's estimated position (LTA provides coordinates).
**US-16 — Share a stop** (Could): a share link that opens directly on a stop's arrivals.
**US-17 — Email/password sign-in** (Could): alternative to GitHub for users without an account.

## 5. MoSCoW priorities

| Priority                 | Stories                                                                                                            | Phase                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| **Must**                 | US-01 Search, US-02 Arrivals, US-03 Auto-refresh, US-04 Downtime, US-05 Waking server, US-06 Responsive/accessible | Phase 2                   |
| **Must**                 | US-07 Sign in, US-08 Favourites                                                                                    | Phase 3                   |
| **Should**               | US-09 Nearby stops                                                                                                 | Phase 3                   |
| **Should**               | US-10 PWA/offline, US-11–13 Leave-now alerts                                                                       | Phase 5                   |
| **Could**                | US-14 Route view, US-15 Bus map, US-16 Share, US-17 Email sign-in                                                  | After v1.0 if time allows |
| **Won't (this release)** | See section 7                                                                                                      | —                         |

## 6. Non-functional requirements

| Area          | Requirement                                                                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cost          | $0/month; design within the limits in [COSTS.md](COSTS.md).                                                                                                                                                   |
| Performance   | API p95 < 300 ms for cached arrivals and search when warm. Web JS for the home route < 150 KB gzipped.                                                                                                        |
| Freshness     | Never call LTA more than once per 20 s per stop (LTA's update frequency).                                                                                                                                     |
| Reliability   | LTA outage must not break search, favourites or the UI (graceful degradation).                                                                                                                                |
| Security      | No secrets in the repo (gitleaks in CI). Auth required for all user data. Input validated with zod. Rate limiting on public endpoints. Internal endpoints protected by a shared secret. helmet + strict CORS. |
| Privacy       | Location never stored server-side. Minimal profile data. Account deletion removes all rows.                                                                                                                   |
| Accessibility | WCAG 2.2 AA.                                                                                                                                                                                                  |
| Quality       | ≥ 70% API test coverage enforced in CI; E2E tests for core flows.                                                                                                                                             |
| Observability | Structured JSON logs (pino), Sentry for errors, `/health` endpoint.                                                                                                                                           |

## 7. Out of scope

- Train (MRT/LRT) arrivals, train service alerts and journey planning (point-to-point routing).
- Fares, EZ-Link/SimplyGo card balance, payments.
- Native iOS/Android apps (the PWA is the mobile app).
- Push notifications on iOS for users who have not added the app to the Home Screen (Web Push on iOS requires an installed PWA).
- Real-time vehicle tracking beyond what LTA's Bus Arrival API provides.
- Multi-language UI (English only for v1).
- Admin dashboard, analytics or ads.
- Any paid service or paid tier.

## 8. Assumptions and risks

| Risk                                                         | Impact                                      | Mitigation                                                                                 |
| ------------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Render free tier sleeps after 15 min; cold start ~1 min      | Slow first load; late alerts                | US-05 UI state; Worker pre-wakes the API before alert windows                              |
| Upstash 500K commands/month shared by staging and production | Cache unavailable for the rest of the month | Memory-first cache, command budget guard, app works without Redis                          |
| LTA API downtime or format change                            | No live data                                | Stale fallback, contract tests against recorded LTA responses                              |
| iOS Web Push limits                                          | Some users cannot get alerts                | Explain in UI; alerts are a Should, not a Must                                             |
| Free-tier terms change                                       | Service stops being free                    | COSTS.md re-checked each phase; services kept swappable (standard Postgres, Redis, Docker) |
