# Budget Tracker

A budget tracker for people who are new to managing money: wallets, budgets,
goals and an AI assistant that understands plain-English entries.

**Stack:** Next.js 16 (App Router, Cache Components) · Better Auth (Google) ·
Drizzle ORM + Neon Postgres · Tailwind 4 + shadcn/ui (Base UI) · Vitest.

## Local development

No Docker needed locally; Docker is only used by the deployment pipeline.

```bash
pnpm install
cp .env.example .env.local   # then fill in the values (see comments inside)
pnpm db:migrate              # create/update tables in Neon
pnpm dev                     # http://localhost:3000
```

Google OAuth needs `http://localhost:3000` as an authorized origin and
`http://localhost:3000/api/auth/callback/google` as a redirect URI.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm build` / `pnpm start` | Production build / run it |
| `pnpm test` | Every Vitest suite: unit, database, integration, component (see [docs/TESTING.md](docs/TESTING.md)) |
| `pnpm test:e2e` | Browser tests (Playwright) against `pnpm dev` |
| `pnpm typecheck` · `pnpm lint` | TypeScript and ESLint |
| `pnpm db:generate` | Create a migration after editing `src/server/db/schema.ts` |
| `pnpm db:migrate` | Apply migrations to the database in `.env.local` |
| `pnpm db:studio` | Browse the database |

In sandboxes that can't open local sockets, build with
`NEXT_WORKER_THREADS=1 pnpm build`.

## Project layout

```
src/
  app/            routes: landing (/), (app)/ signed-in pages, welcome, api/auth
  components/     ui/ (shadcn), app/ (shell, nav), feature components
  lib/            pure helpers shared by client and server (money, dates, ...)
  server/         server-only: db/, auth, session (requireUser), actions/
  proxy.ts        optimistic cookie check; real auth is requireUser()
drizzle/          generated SQL migrations
tests/            unit/, db/, integration/, component/, e2e/ (see docs/TESTING.md)
```

## Conventions

- Money is stored as integer minor units (`amountMinor`); see `src/lib/money.ts`.
- Calendar dates are `YYYY-MM-DD` strings in the user's time zone; see `src/lib/dates.ts`.
- Every server action and route calls `requireUser()` and filters by `userId`.
- Pages render a static shell; anything that reads the session sits behind `<Suspense>`.

## Deployment

The `Dockerfile` builds the standalone server for Hetzner + Coolify. Building
needs no secrets; the runtime needs the variables listed in `.env.example`.
