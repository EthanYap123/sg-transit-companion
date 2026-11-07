# GitHub OAuth setup

Sign-in uses a GitHub OAuth app, which lets people prove who they are with their GitHub account. The app never sees their GitHub password. Creating one is free and needs no card ([limits](COSTS.md)).

This guide covers **local development**. Staging and production get their own apps and secrets in Phase 4, so a leaked local secret cannot affect them.

## 1. Fill in the local env files

```bash
cp apps/web/.env.example apps/web/.env.local
```

Generate two secrets and put them in the files below. Run this once for each value, and use a different value for each:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

| Value                     | Goes in                                | Used for                                     |
| ------------------------- | -------------------------------------- | -------------------------------------------- |
| First value               | `AUTH_SECRET` in `apps/web/.env.local` | Encrypts the sign-in session                 |
| Second value (same twice) | `API_JWT_SECRET` in **both** env files | Signs the short-lived token the API verifies |

Both files are git-ignored. Never commit them or paste their values into issues, PRs or chats.

## 2. Create the OAuth app

1. On GitHub, click your profile picture, then **Settings**.
2. In the left sidebar, click **Developer settings**, then **OAuth Apps**.
3. Click **New OAuth App** (it says **Register a new application** if this is your first).
4. Fill in the form:

   | Field                   | Value                          |
   | ----------------------- | ------------------------------ |
   | Application name        | `SG Transit Companion (local)` |
   | Homepage URL            | `http://localhost:3000`        |
   | Application description | Leave empty                    |

| Redirect URI (older pages say "Authorization callback URL") | `http://localhost:3000/api/auth/callback/github` |
| Allow wildcard matching | Leave unticked |
| Enable Device Flow | Leave unticked |
| Expire user access tokens | Leave as it is |

5. Click **Register application**.

## 3. Copy the credentials

1. Copy the **Client ID** into `AUTH_GITHUB_ID` in `apps/web/.env.local`.
2. Click **Generate a new client secret**. GitHub may ask you to confirm with your password or passkey.
3. Copy the secret straight away, because GitHub shows it only once, into `AUTH_GITHUB_SECRET` in `apps/web/.env.local`.

No quotes or spaces around the values.

## 4. Try it

With Docker open, run `npm run dev:api` and `npm run dev:web`, open http://localhost:3000, and click **Sign in**. GitHub asks you to authorise the app, then sends you back signed in. The app asks only for your public profile, not your private email addresses.

## If something goes wrong

| Problem                                          | Fix                                                                                                       |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| GitHub says the `redirect_uri` is not associated | The callback URL does not match. It must be exactly the one above, on port 3000.                          |
| You lost the client secret                       | Generate a new one on the app's page and delete the old one.                                              |
| A secret was committed or shared                 | Treat it as public. Generate a new one straight away, delete the old one, then remove it from the branch. |
| Sign-in works but the API answers 401            | `API_JWT_SECRET` is different in the two env files.                                                       |
