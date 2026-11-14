# API contract

Base URLs (set in Phase 4):

| Environment | Base URL                                      |
| ----------- | --------------------------------------------- |
| Local       | `http://localhost:4000`                       |
| Staging     | `https://sg-transit-api-staging.onrender.com` |
| Production  | `https://sg-transit-api.onrender.com`         |

All endpoints return JSON (`Content-Type: application/json; charset=utf-8`). Times are ISO 8601 with offset. Public endpoints are versioned under `/v1`. This contract is the source of truth for the web app and the integration tests; changes go through a PR that updates this file.

## Conventions

### Authentication

| Kind                           | Endpoints                 | How                                                                                                                                                                            |
| ------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public                         | `/health`, `/v1/stops/**` | None                                                                                                                                                                           |
| User                           | `/v1/me/**`               | `Authorization: Bearer <API token>` from the web app's `/api/token` (HS256, 15 min, `iss=sg-transit-web`, `aud=sg-transit-api`, `sub=google:<id>`, optional `name`, `picture`) |
| Internal                       | `/internal/**`            | `Authorization: Bearer <CRON_SECRET>`; not in the CORS allow-list                                                                                                              |
| Failed attempts on `/v1/me/**` | 30 failures / minute      | client IP                                                                                                                                                                      |

### Rate limits

| Scope         | Limit                 | Key       |
| ------------- | --------------------- | --------- |
| Public routes | 60 requests / minute  | client IP |
| User reads    | 120 requests / minute | user      |
| User writes   | 30 requests / minute  | user      |
| Internal      | 10 requests / minute  | client IP |

Responses include `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset`. Over the limit: `429 RATE_LIMITED` with `Retry-After`. `/health` is not limited. The internal limit runs before the secret check, so the secret cannot be guessed quickly.

### Errors

Every error uses one shape:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "busStopCode must be 5 digits",
    "details": [{ "path": "busStopCode", "issue": "invalid_string" }],
    "requestId": "c1f9e2b4-..."
  }
}
```

| HTTP | `code`                   | When                                                   |
| ---- | ------------------------ | ------------------------------------------------------ |
| 400  | `VALIDATION_FAILED`      | zod validation of params, query or body failed         |
| 401  | `UNAUTHENTICATED`        | Missing, invalid or expired token                      |
| 403  | `FORBIDDEN`              | Resource belongs to another user                       |
| 404  | `NOT_FOUND`              | Unknown stop, favourite or alert                       |
| 409  | `CONFLICT`               | Duplicate favourite or limit reached (`details.limit`) |
| 413  | `VALIDATION_FAILED`      | Request body over 100 KB                               |
| 429  | `RATE_LIMITED`           | Rate limit hit                                         |
| 503  | `LTA_UNAVAILABLE`        | LTA down and no usable stale data                      |
| 503  | `DEPENDENCY_UNAVAILABLE` | Postgres unavailable for a user route                  |
| 500  | `INTERNAL`               | Anything else (logged to Sentry with `requestId`)      |

Every response carries `X-Request-Id`.

---

## Health

### `GET /health`

Liveness and dependency status. Used by Render health checks, the CD smoke test and the Worker's pre-wake. Never calls LTA.

`200`

```json
{
  "status": "ok",
  "version": "1.0.0",
  "commit": "a1b2c3d",
  "uptimeSeconds": 512,
  "checks": {
    "redis": "ok",
    "stopIndex": { "status": "ok", "count": 5209, "syncedAt": "2026-11-01T12:33:35.634Z" },
    "lta": { "circuit": "closed" }
  }
}
```

`status` is `ok`, `degraded` (Redis down, or the LTA circuit open or half-open) or `down` (stop index empty, e.g. still loading at boot). Returns `503` only when `down`. `redis` is `ok`, `down` or `disabled` (not configured). `Cache-Control: no-store`.

Postgres is deliberately not checked: a health check every few seconds would keep Neon awake and use up its free compute hours.

---

## Stops (public)

### `GET /v1/stops/search?q={query}&limit={n}`

Search the in-memory stop index by code, description or road name.

| Param   | Rules                         |
| ------- | ----------------------------- |
| `q`     | Required, 2–50 chars, trimmed |
| `limit` | Optional, 1–20, default 20    |

Ranking: exact code → code prefix → description/road starting with the query → all query tokens present.

`200`

```json
{
  "query": "vic st",
  "results": [
    {
      "code": "01012",
      "description": "Hotel Grand Pacific",
      "roadName": "Victoria St",
      "latitude": 1.29685,
      "longitude": 103.853
    }
  ]
}
```

Cache: `Cache-Control: public, max-age=3600`. Works when LTA is down.

### `GET /v1/stops/nearby?lat={lat}&lng={lng}&radius={m}&limit={n}`

| Param    | Rules                                        |
| -------- | -------------------------------------------- |
| `lat`    | Required, 1.15–1.48 (Singapore bounds)       |
| `lng`    | Required, 103.6–104.1                        |
| `radius` | Optional, whole metres 100–1000, default 500 |
| `limit`  | Optional, 1–20, default 10                   |

Results are the stops within `radius`, nearest first (ties by stop code), from the in-memory stop index. `distanceMeters` is the straight-line (great-circle) distance rounded to the metre, not a walking route. An empty `results` list is a normal answer, including while the index is still loading at boot.

`200`

```json
{
  "results": [
    {
      "code": "83299",
      "description": "Aft Lor G Telok Kurau",
      "roadName": "Still Rd",
      "latitude": 1.31574389673514,
      "longitude": 103.90586328314893,
      "distanceMeters": 27
    }
  ]
}
```

(Real answer for `lat=1.3155&lng=103.9059`, first of 10 results.)

Coordinates are not logged, stored or repeated in error messages. `Cache-Control: no-store`, so no browser or proxy keeps a copy of where the user was. `400 VALIDATION_FAILED` for a missing or out-of-range value (`details[0].path` names it).

### `GET /v1/stops/{code}`

`code`: 5 digits. `200` returns one stop object (as in search). `404 NOT_FOUND` if unknown.

### `GET /v1/stops/{code}/arrivals?service={serviceNo}`

Live arrivals, normalised from LTA Bus Arrival v3. `service` optional (e.g. `15`, `185A`).

`200`

```json
{
  "stopCode": "83139",
  "fetchedAt": "2026-10-29T08:14:03+08:00",
  "stale": false,
  "source": "lta",
  "services": [
    {
      "serviceNo": "15",
      "operator": "GAS",
      "buses": [
        {
          "estimatedArrival": "2026-10-29T08:16:48+08:00",
          "minutesAway": 2,
          "monitored": true,
          "load": "SEATS_AVAILABLE",
          "wheelchairAccessible": true,
          "type": "SINGLE_DECK",
          "visitNumber": 1,
          "originCode": "77009",
          "destinationCode": "77009"
        }
      ]
    }
  ]
}
```

| Field         | Notes                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------- |
| `stale`       | `true` when served from the last-known-good cache because LTA failed                     |
| `source`      | `lta` (fresh), `cache` (fresh from Redis after restart) or `stale`                       |
| `services`    | In natural service order: 2, 10, 10e, 12, 185, 185A                                      |
| `buses`       | 0–3 items, soonest first; LTA's empty `NextBus2/3` are dropped, not returned as nulls    |
| `minutesAway` | Whole minutes from `fetchedAt`, floored, minimum 0 (UI shows "Arr" at ≤ 1)               |
| `monitored`   | `false` when the time comes from the operator's schedule, not the bus's location         |
| `load`        | `SEATS_AVAILABLE` \| `STANDING_AVAILABLE` \| `LIMITED_STANDING` \| `null` (not reported) |
| `type`        | `SINGLE_DECK` \| `DOUBLE_DECK` \| `BENDY` \| `null` (not reported)                       |

Empty `services: []` with `200` means no buses in service (e.g. at night). `404` if the stop is not in the index (skipped while the index is still loading at boot). `503 LTA_UNAVAILABLE` with `Retry-After: 30` if LTA is down and no data under 10 minutes old exists. `service` is matched case-insensitively; a service that does not stop there gives `services: []`.

Cache: `Cache-Control: public, max-age=10`. Server-side caching per [ARCHITECTURE.md §3](ARCHITECTURE.md#3-cache-and-ttl-strategy).

---

## Current user (auth required)

All responses `Cache-Control: no-store`.

### `GET /v1/me`

`200` `{ "id": "uuid", "name": "Ethan", "imageUrl": "https://…", "createdAt": "…" }`. Creates the user row on first call, and keeps the profile and last-seen time current after that. `401 UNAUTHENTICATED` without a valid token. `503 DEPENDENCY_UNAVAILABLE` if the database is unavailable.

### `DELETE /v1/me`

Deletes the user and all their data. `204`, including when the account is already gone, so a retry is safe. Same `401` and `503` as above.

### Favourites

#### `GET /v1/me/favourites`

`200` `{ "favourites": [ { "id": "uuid", "stop": { …stop, "inService": true }, "label": "Home", "sortOrder": 0 } ] }`, in the user's order. `inService` is `false` when LTA no longer lists the stop; it stays saved so the app can say so.

#### `POST /v1/me/favourites`

Body: `{ "busStopCode": "83139", "label": "Home" }` (`label` optional, ≤ 30 chars).
`201` with the favourite, added at the end of the list. A blank label is stored as `null`. `404` unknown stop. `409 CONFLICT` if already saved, or if 20 are saved (`details: [{ "path": "limit", "issue": "20" }]`). The first save creates the user if `GET /v1/me` was never called.

#### `PATCH /v1/me/favourites/{id}`

Body: `{ "label": "School" }`, or `{ "label": null }` to clear it. `200` with the favourite.

#### `PUT /v1/me/favourites/order`

Body: `{ "ids": ["uuid", "uuid", …] }` — must contain exactly the user's favourites, each once, or `400 VALIDATION_FAILED` (`details[0].path` is `ids`). `200` with the reordered list.

#### `DELETE /v1/me/favourites/{id}`

`204`.

For `PATCH` and `DELETE`, an id that is not one of the caller's favourites answers `404`, the same as an id that does not exist, so ids of other users' favourites cannot be discovered.

### Push subscriptions

#### `GET /v1/push/vapid-public-key` (public)

`200` `{ "publicKey": "BEl6…" }`

#### `POST /v1/me/push-subscriptions`

Body: the browser's `PushSubscription.toJSON()`: `{ "endpoint": "https://…", "keys": { "p256dh": "…", "auth": "…" } }`. Upserts by endpoint. `201`.

#### `DELETE /v1/me/push-subscriptions`

Body: `{ "endpoint": "https://…" }`. `204`.

#### `POST /v1/me/push-subscriptions/test`

Sends "Test notification from SG Transit Companion" to all the user's subscriptions. `202` `{ "sent": 2, "failed": 0 }`.

### Leave-now alerts

Alert object:

```json
{
  "id": "uuid",
  "busStopCode": "83139",
  "serviceNo": "15",
  "walkMinutes": 6,
  "days": ["MON", "TUE", "WED", "THU", "FRI"],
  "windowStart": "07:30",
  "windowEnd": "08:15",
  "enabled": true,
  "lastSentAt": null
}
```

Validation: `serviceNo` must serve the stop (checked against the stop's latest arrivals when buses are running; otherwise only the format is checked), `walkMinutes` 1–30, `days` non-empty, `HH:mm` in SGT, window 1–120 minutes and not crossing midnight. Max 5 alerts per user.

| Method   | Path                 | Body                                        | Success                         |
| -------- | -------------------- | ------------------------------------------- | ------------------------------- |
| `GET`    | `/v1/me/alerts`      | —                                           | `200 { "alerts": [ … ] }`       |
| `POST`   | `/v1/me/alerts`      | alert without `id`, `enabled`, `lastSentAt` | `201` alert; `409` if 5 reached |
| `PATCH`  | `/v1/me/alerts/{id}` | any editable field, including `enabled`     | `200` alert                     |
| `DELETE` | `/v1/me/alerts/{id}` | —                                           | `204`                           |

Every write rebuilds the Redis alert schedule.

---

## Internal (shared secret)

### `POST /internal/alerts/tick`

Called by the Cloudflare Worker (production) or the CD smoke test (staging). Runs the alert engine once. Idempotent.

`202` `{ "alertsChecked": 4, "sent": 1, "skipped": 3, "durationMs": 182 }`

### `POST /internal/stops/sync`

Called weekly by a GitHub Actions schedule. Pages through LTA `BusStops`, upserts `BusStop`, rewrites the Redis snapshot and reloads the in-memory index. Only one run at a time (`409` if already running).

`202` `{ "runId": "uuid" }` — progress visible in `/health` (`stopIndex.syncedAt`).

### `GET /internal/client-ip`

Shows how the API reads the caller's address behind the host's proxies, to choose and verify `TRUST_PROXY` after a deploy. `ip` is the address rate limits use; `forwardedFor` is the raw `X-Forwarded-For` header as the proxies delivered it. `Cache-Control: no-store`.

`200` `{ "ip": "203.0.113.5", "ips": ["203.0.113.5"], "forwardedFor": "203.0.113.5, 10.0.0.1", "trustProxy": 1 }`

`TRUST_PROXY` is right when `ip` is the caller's real public address, and sending a made-up `X-Forwarded-For` does not change it.
