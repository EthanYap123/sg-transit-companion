# syntax=docker/dockerfile:1
# Production image for the API. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t sg-transit-api .

ARG NODE_IMAGE=node:22-alpine

# ---- Build: install the API's dependencies, generate the Prisma client, compile TypeScript ----
FROM ${NODE_IMAGE} AS build
WORKDIR /app

# Manifests first, so the dependency layer is cached until they change. Only the API workspace is
# copied, so the web app's packages are never installed.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
# Scripts are skipped: the root `prepare` installs git hooks, and the Prisma client is generated below.
RUN npm ci --workspace apps/api --ignore-scripts --no-audit --no-fund

COPY tsconfig.base.json ./
COPY apps/api/ apps/api/
RUN npm run db:generate --workspace apps/api \
  && npm run build --workspace apps/api

# ---- Runtime: production dependencies and compiled output only ----
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
# Optional and peer dependencies are left out: @prisma/client lists the Prisma CLI (with Studio, React
# and TypeScript) as an optional peer, which the running API never uses. Migrations run from CI, not
# from this image. Nothing the API loads is optional (pg runs without pg-native).
# Prisma ships a query compiler for every database it supports; only the PostgreSQL ones are kept.
RUN npm ci --workspace apps/api --omit=dev --omit=optional --omit=peer --ignore-scripts --no-audit --no-fund \
  && find node_modules/@prisma/client/runtime -type f \
    \( -name '*sqlserver*' -o -name '*mysql*' -o -name '*sqlite*' -o -name '*cockroachdb*' \) -delete \
  && npm cache clean --force

COPY --from=build /app/apps/api/dist apps/api/dist

# Shown by GET /health so a deploy can be checked against the commit it came from.
ARG APP_VERSION=0.0.0
ARG GIT_COMMIT=local
ENV APP_VERSION=${APP_VERSION} \
    GIT_COMMIT=${GIT_COMMIT} \
    PORT=4000

USER node
EXPOSE 4000

# Render runs its own check on /health; this one is for `docker run` and Compose.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["node", "apps/api/dist/server.js"]
