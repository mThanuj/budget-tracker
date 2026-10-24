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
# Secrets are only needed at runtime, not to build.
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
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
