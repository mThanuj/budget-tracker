# Production image for Hetzner + Coolify. Uses Next.js standalone output.
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Secrets are only needed at runtime, not to build. The Sentry DSN is public and
# read at build time; empty leaves error monitoring off (docs/OBSERVABILITY.md).
ARG NEXT_PUBLIC_SENTRY_DSN=""
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM base AS runner
# RUN_MIGRATIONS: pending database migrations are applied on startup (src/instrumentation.ts).
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 RUN_MIGRATIONS=1
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder /app/public ./public
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/drizzle ./drizzle
USER app
EXPOSE 3000
# Migrations can take a few seconds on a cold database, hence the start period.
# Liveness, not /api/health: restarting the app doesn't help when the database
# is down, and a query every 30 s would keep Neon awake.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health/live >/dev/null || exit 1
CMD ["node", "server.js"]
