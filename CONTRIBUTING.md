# Contributing

Thanks for helping. This guide covers local setup, the branching and commit rules, and what "done" means for a change.

## Local setup

Requirements: Node.js 22 (see `.nvmrc`) and npm 10. Docker is optional; it runs Postgres and Redis for the API from Phase 2 onwards.

```bash
git clone https://github.com/EthanYap123/sg-transit-companion.git
cd sg-transit-companion
npm ci                      # also installs the git hooks
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
docker compose up -d --wait # Postgres on localhost:5433, Redis on localhost:6379
npm run dev:api             # http://localhost:4000/health
npm run dev:web             # http://localhost:3000
```

| Command               | What it does                                          |
| --------------------- | ----------------------------------------------------- |
| `npm run lint`        | ESLint in both apps, zero warnings allowed            |
| `npm run format`      | Prettier on the whole repo (`format:check` to verify) |
| `npm run typecheck`   | TypeScript in both apps                               |
| `npm test`            | Vitest in both apps                                   |
| `npm run build`       | Production build of both apps                         |
| `docker compose down` | Stop Postgres and Redis (`-v` also deletes the data)  |

## Workflow

1. **Start from an issue.** Every change has a GitHub issue with a `phase-N` label and milestone.
2. **Branch from an up-to-date `main`**, one branch per issue: `<type>/<short-name>`, e.g. `feat/stop-search`, `fix/arrivals-night-empty`, `docs/api-contract`.
3. **Commit in small, focused steps** using [Conventional Commits](https://www.conventionalcommits.org): `type(scope): summary`.
   - Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
   - Scopes (optional): `api`, `web`, `worker`, `db`, `ci`, `deps`, `docs`, `release`.
   - Examples: `feat(api): cache bus arrivals for 20 seconds`, `fix(web): keep last arrivals on a failed refresh`.
   - The `commit-msg` hook runs commitlint; the `pre-commit` hook runs ESLint and Prettier on staged files.
4. **Open a pull request** (not a draft when it is ready) using the template. Reference the issue with `Closes #N`. The PR title must also be a Conventional Commit because it becomes the squash commit message.
5. **CI must be green**, then **squash-merge**. The branch is deleted automatically.
6. Never commit directly to `main`, and never force-push it.

## Definition of done

- [ ] Acceptance criteria in the issue are met
- [ ] Tests cover the change (API coverage stays at or above 70% from Phase 2)
- [ ] Lint, typecheck, tests, build and gitleaks pass in CI
- [ ] `docs/` updated when behaviour, the API contract, the data model or costs change; a new ADR for any significant decision
- [ ] `CHANGELOG.md` updated under **Unreleased**
- [ ] No secrets in the diff: real values live only in git-ignored `.env` files, GitHub Actions secrets and host dashboards
- [ ] Still inside the free tiers in [`docs/COSTS.md`](docs/COSTS.md)

## Secrets

- Only `.env.example` files are committed. `.env`, `.env.local` and every other `.env.*` file are git-ignored.
- gitleaks scans the full history on every pull request. If it flags a real secret, **rotate the secret first** (the old value is public), then remove it from the branch.
- Never paste tokens, keys or push subscription data into issues, PRs or logs.

## Branch protection for `main`

`main` is protected by the `protect-main` ruleset (**Settings → Rules → Rulesets**). Its settings, for reference or to recreate it:

| Setting                               | Value                                                                                                                                                                                                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ruleset name                          | `protect-main`                                                                                                                                                                                                                                            |
| Enforcement status                    | **Active**                                                                                                                                                                                                                                                |
| Bypass list                           | **Empty** (rules apply to the owner too)                                                                                                                                                                                                                  |
| Target branches                       | **Include default branch**                                                                                                                                                                                                                                |
| Restrict deletions                    | On                                                                                                                                                                                                                                                        |
| Require linear history                | On                                                                                                                                                                                                                                                        |
| Require a pull request before merging | On. Required approvals: **0** (a solo maintainer cannot approve their own PR). Dismiss stale approvals: on. Require conversation resolution before merging: on. Allowed merge methods: **Squash**.                                                        |
| Require status checks to pass         | On. Require branches to be up to date before merging: on. Add these checks (source: GitHub Actions): `Lint and format`, `Typecheck`, `Unit tests`, `Build`, `Secret scan (gitleaks)`, `Docker Compose services`, `PR title follows Conventional Commits`. |
| Block force pushes                    | On                                                                                                                                                                                                                                                        |

Under **Settings → Code security**, **Secret scanning**, **Push protection**, **Dependabot alerts** and **Dependabot security updates** are on (all free for public repositories).

Because the PR title check only runs on pull requests, a change can only reach `main` through a PR. If a required check is ever renamed in `ci.yml`, update the ruleset in the same PR, or every PR will wait for a check that never runs.
