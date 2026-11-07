# 0005. Sign in with Google instead of GitHub

- Status: Accepted
- Date: 2026-11-07
- Supersedes: the provider choice in [ADR 0004](0004-github-sign-in-with-authjs.md). Auth.js, JWT sessions and the short-lived API token stay as decided there.
- Related: issue #58, [GOOGLE_OAUTH.md](../GOOGLE_OAUTH.md)

## Context

ADR 0004 chose GitHub because it was quick to set up and suits a developer audience. But the people this app is for are Singapore bus commuters, and most of them have no GitHub account. They could search and see arrivals, but not save stops or set alerts, which are the reasons to come back.

## Decision

Use **Google as the only sign-in provider** and remove GitHub.

- Request only `openid profile`: name and picture. Without the `email` scope the app never receives an address, so it holds less personal data than the GitHub version did.
- Identify users by Google's permanent `sub` value, stored as `google:<sub>`.

## Alternatives considered

| Option                          | Pros                                                                          | Cons                                                                                        |
| ------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Google only (chosen)**        | Nearly every commuter already has an account; no passwords; small code change | Depends on a Google Cloud project; people without Google cannot save stops                  |
| GitHub and Google               | Keeps a developer option                                                      | A second app and secret to manage for very few real users                                   |
| Keep GitHub only                | Already built                                                                 | Shuts out most of the intended users                                                        |
| Email and password              | Works for anyone                                                              | Password storage, reset emails and a mail service: the most work and the most security risk |
| No accounts, save on the device | No sign-in at all                                                             | Nothing syncs between devices, and clearing the browser loses everything                    |

## Consequences

- Only `apps/web/src/auth.ts`, the sign-in buttons and the local env names changed. The API does not know the provider: it only checks tokens, and `auth_subject` already allowed any provider, so no migration was needed.
- The `users.email` column stays but is always empty. It can be dropped in a later migration.
- Apps using only name, email and profile scopes do not need Google's verification, and users do not have to be on a test list. Without verification, Google's consent screen shows the domain rather than the app's name and logo. Publishing the app in Phase 4 may need a homepage and privacy policy link.
- Google's docs do not say whether a billing account is needed, but creating the project, app and client on 7 Nov 2026 asked for no card. The first real sign-in worked the same day.
