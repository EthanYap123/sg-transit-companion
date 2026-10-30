# Architecture Decision Records

Each ADR records one significant decision: the context, what was decided, the options considered and the consequences. ADRs are numbered, never deleted, and are superseded by a new ADR when a decision changes.

| #                                           | Title                                                    | Status   |
| ------------------------------------------- | -------------------------------------------------------- | -------- |
| [0001](0001-redis-cache-in-front-of-lta.md) | Cache LTA data in memory and Redis                       | Accepted |
| [0002](0002-separate-express-api.md)        | Run the API as a separate Express service                | Accepted |
| [0003](0003-cloudflare-cron-for-alerts.md)  | Trigger "leave now" alerts from a Cloudflare Worker cron | Accepted |

New ADRs start from [template.md](template.md).
