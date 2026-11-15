# Google sign-in setup

Sign-in uses a Google OAuth client, which lets people prove who they are with their Google account. The app never sees their Google password, and it asks only for their name and picture, not their email address.

Sections 1–6 cover **local development**. Staging and production have their own clients and secrets (see [Staging and production](#staging-and-production)), so a leaked local secret cannot affect them.

**Cost:** this setup asked for no card or billing account when it was done on 7 Nov 2026 ([details](COSTS.md)). You can ignore the "$300 free trial" banner in Google Cloud: it is optional. If Google ever asks for a card at any step, stop: this project runs at zero cost.

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

## 2. Create the Google project

1. Open https://console.cloud.google.com/ and sign in with your Google account.
2. Click the project picker at the top, then **New project**.
3. Name it `SG Transit Companion` and click **Create**. Then select the new project in the picker.

## 3. Register the app

1. Open https://console.cloud.google.com/auth/overview and click **Get started**.
2. Fill in the form. Google's wording may differ slightly:

   | Field              | Value                  |
   | ------------------ | ---------------------- |
   | App name           | `SG Transit Companion` |
   | User support email | Your email address     |
   | Audience           | **External**           |
   | Contact email      | Your email address     |

3. Agree to Google's policy and click **Create**.

There is no need to add scopes or test users. The app asks only for basic profile details, which Google allows for any account without a test-user list, even while the app is in Testing.

## 4. Create the client

1. Open https://console.cloud.google.com/auth/clients and click **Create client**.
2. Fill in the form:

   | Field                         | Value                                            |
   | ----------------------------- | ------------------------------------------------ |
   | Application type              | **Web application**                              |
   | Name                          | `SG Transit local`                               |
   | Authorized JavaScript origins | Leave empty                                      |
   | Authorized redirect URIs      | `http://localhost:3000/api/auth/callback/google` |

3. Click **Create**.

## 5. Copy the credentials

Copy both values straight away, because Google shows the full secret only once.

1. Copy the **Client ID** into `AUTH_GOOGLE_ID` in `apps/web/.env.local`.
2. Copy the **Client secret** into `AUTH_GOOGLE_SECRET` in `apps/web/.env.local`.

No quotes or spaces around the values.

## 6. Try it

With Docker open, run `npm run dev:api` and `npm run dev:web`, open http://localhost:3000, and click **Sign in**. Choose your Google account, and you return signed in.

Until the app goes through Google's optional brand verification, Google's screen shows the app's domain rather than its name and logo. Sign-in works without it.

## Staging and production

The same Google project has one client per environment. Each allows only its own site:

| Client                  | Authorized JavaScript origin                      | Authorized redirect URI                                                    |
| ----------------------- | ------------------------------------------------- | -------------------------------------------------------------------------- |
| `SG Transit local`      | (none)                                            | `http://localhost:3000/api/auth/callback/google`                           |
| `SG Transit staging`    | `https://sg-transit-companion-staging.vercel.app` | `https://sg-transit-companion-staging.vercel.app/api/auth/callback/google` |
| `SG Transit production` | `https://sg-transit-companion.vercel.app`         | `https://sg-transit-companion.vercel.app/api/auth/callback/google`         |

Each client's ID and secret are Vercel env vars (`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, type **Secret**) scoped to their environment only: **Production** for production, **Preview** for staging. A new value takes effect after a redeploy.

**Consent screen (Branding).** Home page `https://sg-transit-companion.vercel.app`, privacy policy `https://sg-transit-companion.vercel.app/privacy`, authorized domains `sg-transit-companion.vercel.app` and `sg-transit-companion-staging.vercel.app`. No logo is uploaded, because a logo makes Google verification mandatory.

**Publishing status: In production** (Audience page, since 15 Nov 2026), so any Google account can sign in. With only the `openid` and `profile` scopes, no verification is needed. "Back to testing" on the same page reverts it.

### Rotating a client secret

1. Open the client, then **Client secrets** → **Add secret**. Use the copy icon next to the new secret (marked NEW); Google hides the value straight away but the copy icon still works.
2. Put the new value in the environment's `AUTH_GOOGLE_SECRET` on Vercel and redeploy that environment.
3. Sign in on that site to confirm the new secret works.
4. **Disable** the old secret, then delete it. A client can hold at most two secrets.

## If something goes wrong

| Problem                               | Fix                                                                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Google says `redirect_uri_mismatch`   | The redirect URI does not match. It must be exactly the one above, on port 3000. Changes can take from 5 minutes to a few hours to apply. |
| You lost the client secret            | Add a new secret on the client's page, then remove the old one.                                                                           |
| A secret was committed or shared      | Treat it as public. Create a new secret straight away, remove the old one, then remove it from the branch.                                |
| Sign-in works but the API answers 401 | `API_JWT_SECRET` is different in the two env files.                                                                                       |
| Google asks for a card or billing     | Stop. This project must stay free.                                                                                                        |
