# Deployment runbook

How code reaches staging and production, where every setting lives, and what to do when something goes wrong. The services themselves are described in [ARCHITECTURE.md](ARCHITECTURE.md#hosted-services); their free-tier limits are in [COSTS.md](COSTS.md).

## Environments

|                 | Staging                                           | Production                                |
| --------------- | ------------------------------------------------- | ----------------------------------------- |
| Web             | `https://sg-transit-companion-staging.vercel.app` | `https://sg-transit-companion.vercel.app` |
| API             | `https://sg-transit-api-staging.onrender.com`     | `https://sg-transit-api.onrender.com`     |
| Database        | Neon branch `staging`                             | Neon branch `production`                  |
| Redis           | Upstash, prefix `stg:`                            | Upstash, prefix `prod:`                   |
| Deployed by     | Every merge to `main` (except docs-only changes)  | A `v*` tag                                |
| Who can open it | Only someone signed in to the Vercel account      | Everyone                                  |

## How a deploy works

The **Deploy** workflow (`.github/workflows/deploy.yml`) runs these jobs in order. If one fails, the later ones do not run.

1. **API image**: build the API image, smoke test it against a throwaway Postgres, and push `ghcr.io/ethanyap123/sg-transit-api:sha-<commit>`.
2. **Migrate database**: `prisma migrate deploy` against the environment's Neon branch.
3. **Deploy API to Render**: call the service's deploy hook with that exact image, then wait up to 15 minutes until `/health` reports the new commit.
4. **Deploy web to Vercel**: `vercel deploy` builds on Vercel with the environment's own env vars (`--prod` for production). Staging's address follows the newest preview of branch `main` (a domain setting in Vercel), and Git deploys are off, so it always shows the latest CI deploy.
5. **Smoke test**: the API reports the commit and more than 5,000 stops, search and nearby return stops, `/v1/me` answers 401, CORS allows only the matching site, and the site's home and privacy pages load.

Runs for the same environment queue instead of overlapping, and are never cancelled halfway.

### Release to production

1. Check the last staging deploy is green and try the change on staging.
2. Update `CHANGELOG.md`: move **Unreleased** under a new version heading, in a PR.
3. Tag the merge commit on `main` and push the tag:

   ```bash
   git switch main && git pull
   git tag -a v0.4.0 -m "v0.4.0"
   git push origin v0.4.0
   ```

4. Watch the **Deploy** run for the tag. Production's `/health` then reports the tag's version and commit.

### Run a deploy by hand

Actions → **Deploy** → **Run workflow**, choose the ref and the environment. Production only accepts `v*` tags; staging only accepts `main`.

## Migrations

Migrations run **before** the new API starts, while the old API is still serving. So every migration must work with the code already running:

- Add columns as nullable or with a default; add tables freely.
- To remove or rename something, do it in two releases: first stop using it, then remove it.
- `prisma migrate deploy` only applies new migrations, so re-running a deploy is safe.

## Roll back

Work out what broke first: the web app, the API, or the data.

| Problem                    | Fastest fix                                                                                                                                                                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bad web release            | Vercel → project → **Deployments** → the previous production deployment → **Instant Rollback**. Later production deploys do not take the address until you undo the rollback (the banner on the project overview → **Manage** → promote). |
| Bad API release            | Render → service → **Events** → the previous deploy → **Rollback**. Or run **Deploy** by hand for the previous `v*` tag (production) or an earlier commit (staging); its migration step does nothing if the schema is already current.    |
| Bad data after a migration | Neon keeps 6 hours of history: Neon → project → branch → **Backup & Restore**, restore to a time before the deploy. This replaces all data written since, so check with the smoke test and a careful look first.                          |
| Release must be redone     | Fix forward: merge the fix, check staging, then tag a new patch version (`v0.4.1`). Never move or reuse a tag.                                                                                                                            |

## Saving secrets in GitHub

Save a value exactly as it is. On Windows, `... | gh secret set` in PowerShell adds an invisible byte-order mark and a line ending, which broke every secret saved that way (the first staging run failed with "The scheme is not recognized"). Use one of these instead:

```bash
gh secret set NAME --env staging          # then paste the value at the prompt
```

or, from a file written without a BOM, `cmd /c "gh secret set NAME --env staging < value.txt"` and delete the file afterwards. The Vercel token in `VERCEL_TOKEN` is limited to this project, so it can deploy but cannot change domains or other projects.

## Where settings live

Nothing secret is in the repo. Each value lives in exactly one place per environment.

| Where                                                | What                                                                                                                                                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub environment secrets (`staging`, `production`) | `DATABASE_URL_DIRECT` (Neon, unpooled, for migrations), `RENDER_DEPLOY_HOOK`; staging also `VERCEL_AUTOMATION_BYPASS_SECRET` (lets the smoke test past staging's protection)                 |
| GitHub environment variables                         | `API_URL`, `WEB_URL`                                                                                                                                                                         |
| GitHub repository                                    | Secret `VERCEL_TOKEN` (limited to this Vercel project); variables `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`                                                                                       |
| Render service environment                           | `DATABASE_URL` (Neon pooled), `REDIS_URL`, `REDIS_KEY_PREFIX`, `REDIS_DAILY_COMMAND_BUDGET`, `LTA_ACCOUNT_KEY`, `API_JWT_SECRET`, `CRON_SECRET`, `CORS_ORIGINS`, `TRUST_PROXY=3`, `NODE_ENV` |
| Vercel project, per environment                      | `NEXT_PUBLIC_API_URL`, `AUTH_SECRET`, `API_JWT_SECRET` (same value as that environment's Render service), `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`                                             |

Changing a Render or Vercel env var needs a redeploy of that service to take effect (Render offers **Save and deploy**; on Vercel, redeploy the current deployment).

## Rotating secrets

Replace one secret at a time, check, then remove the old one. Never paste values into chats, issues or commits.

| Secret                            | How                                                                                                                                                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `API_JWT_SECRET`                  | Generate a new value; set it on the environment's Render service **and** Vercel project, then redeploy both. Signed-in users get a new API token on their next request. |
| `AUTH_SECRET`                     | Set a new value on Vercel and redeploy. Everyone in that environment is signed out.                                                                                     |
| Google client secret              | See [GOOGLE_OAUTH.md](GOOGLE_OAUTH.md#rotating-a-client-secret).                                                                                                        |
| `CRON_SECRET`                     | New value on the Render service, **Save and deploy**.                                                                                                                   |
| Neon password                     | Neon → Roles → **Reset password**. Update `DATABASE_URL` on Render and `DATABASE_URL_DIRECT` in GitHub for that branch.                                                 |
| Upstash password                  | Upstash → database → **Reset password**. Update `REDIS_URL` on both Render services (they share one database).                                                          |
| Render deploy hook                | Render → service → Settings → **Regenerate hook**, then update `RENDER_DEPLOY_HOOK` in GitHub.                                                                          |
| `VERCEL_TOKEN`                    | Vercel → Account Settings → Tokens: create a new token limited to this project, update the GitHub secret, then revoke the old token.                                    |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Vercel → project → Deployment Protection → Protection Bypass for Automation: **Regenerate**, then update the GitHub secret.                                             |

## When a free-tier limit is hit

See [COSTS.md](COSTS.md#if-a-limit-is-hit) for what users see. In short: Render hours or bandwidth suspend both APIs until the 1st; Neon compute suspension stops sign-in features until the next period; Upstash quota only removes the stale-data fallback. Nothing here needs a card: wait for the reset, and pause staging deploys if hours are running low.

## Manual checks after a production release

Automated checks cover the API and that pages load. These need a person:

1. Open the production site on a phone over mobile data. Search for a stop and open live arrivals.
2. Sign in with Google, save a stop, and see it on the home screen. Sign out.
3. **Stops near you** on the phone over https: tap **Use my location**, allow it, and see nearby stops with distances. Then block location for the site in the browser settings, tap again, and see the clear "location is blocked" message pointing to search.
4. Switch between light and dark mode, and check `/privacy` reads well on the phone.
5. Rate limits see real addresses: with the phone as a hotspot, `curl -H "Authorization: Bearer <CRON_SECRET>" <api>/internal/client-ip` shows the phone network's address, not your home one.
