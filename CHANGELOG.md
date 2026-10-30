# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Cost plan with confirmed free-tier limits for every service, and free-tier trade-offs in the README (#2)
- Product requirements with user stories, acceptance criteria and MoSCoW priorities (#1)
- System architecture: diagrams, cache and TTL strategy, LTA failure handling and free-tier design (#3)
- Data model (ERD) with table rules and size estimate (#4)
- API contract for public, user and internal endpoints (#5)
- ADRs 0001-0003: two-level cache, separate Express API, Cloudflare cron for alerts (#6)
- npm workspaces monorepo with an Express API skeleton (`GET /health`) and a Next.js web skeleton, each with tests (#15)
- Docker Compose for local Postgres 16 and Redis 7, and `.env.example` files for the root, API and web (#16)
- ESLint (typescript-eslint with type info for the API, Next.js rules for the web), Prettier, Husky pre-commit (lint-staged) and commit-msg (commitlint) hooks (#17)

### Changed

- TypeScript pinned to 6.0 so typescript-eslint can lint with type information (#17)
- CI on every pull request: lint and format, typecheck, unit tests, build, gitleaks secret scan, Docker Compose health check and PR-title commitlint; CI badge in the README (#18)
- Pull request template, bug and feature issue forms, CONTRIBUTING.md with the definition of done and branch protection rules, and local setup in the README (#19)
