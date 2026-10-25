# ClearPaisa

A budget tracker for people new to managing money: wallets, entries, budgets,
goals, recurring bills, and an AI assistant that turns plain-English notes into
entries and answers questions from your own data. Live at
https://clearpaisa-seven.vercel.app.

**Stack:** Next.js 16 (App Router, Cache Components) · React 19 · TypeScript ·
Better Auth (Google sign-in) · Drizzle ORM on Neon Postgres · Tailwind 4 +
shadcn/ui (Base UI) · Vercel AI SDK with OpenAI-compatible providers · Razorpay
(behind a switch, off) · Vitest, PGlite and Playwright.

## Prerequisites

- **Node.js 24** (`.nvmrc`; `nvm use` picks it up) and **pnpm 11** through
  Corepack: `corepack enable` once, and the version in `package.json` is used.
- **A Postgres database.** Development uses its own Neon project or branch,
  never production (the browser tests write to it).
- **A Google OAuth client** (Google Cloud console → APIs & Services →
  Credentials) with `http://localhost:3000` as an authorized origin and
  `http://localhost:3000/api/auth/callback/google` as a redirect URI.
- Optional: an AI provider key (Groq is free) to try the AI features; Razorpay
  test keys to try payments. The app works fully without either.

No Docker is needed locally; it's only used to build the self-hosted image.

## Setup

```bash
corepack enable
pnpm install
cp .env.example .env.local   # fill in the values; comments explain each one
pnpm db:migrate              # create or update the tables
pnpm dev                     # http://localhost:3000
```

## Environment variables

`.env.example` lists every setting with a comment, and holds no real values.
Keep real values in `.env.local` (git ignores it) locally, and in the hosting
platform's settings in production. Settings are validated when first used
(`src/env.ts`), so a missing one fails loudly instead of half-working.

| Group     | Variables                                                                                                                | Needed                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| Database  | `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED` (migrations)                                                            | yes                                      |
| Sign-in   | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                                      | yes                                      |
| Daily job | `CRON_SECRET` (at least 24 characters)                                                                                   | in production                            |
| AI        | `LLM_CHAIN_FREE`, `LLM_CHAIN_PRO`, `LLM_<PROVIDER>_*`, `AI_GLOBAL_DAILY_LIMIT`                                           | no (AI features hide without a key)      |
| Payments  | `BILLING_ENABLED`, `RAZORPAY_*`                                                                                          | no (off unless `BILLING_ENABLED="true"`) |
| Site      | `NEXT_PUBLIC_APP_NAME`, `ADMIN_EMAILS`, `LEGAL_NAME`, `SUPPORT_EMAIL`, `SUPPORT_PHONE`, `BUSINESS_ADDRESS`, `LEGAL_CITY` | legal details in production              |

Only `NEXT_PUBLIC_APP_NAME` reaches the browser; `pnpm check:bundle` (after a
build) fails if any secret's value ends up in client files.

Developer knobs, not for `.env.local`: `LIVE_AI=1` (run the browser tests that
call the real AI), `PW_WORKERS` (parallel browsers), `NEXT_WORKER_THREADS=1`
(build in sandboxes that can't open local sockets), `AI_EVAL_DELAY_MS` and
`SHOW_FACTS` (the `ai:*` scripts). `RUN_MIGRATIONS=1` is set by the Docker image.
`CI`, `VERCEL`, `VERCEL_ENV` and `NODE_ENV` are set by the platforms.

## Scripts

| Command                                                                                | What it does                                                                         |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm dev`                                                                             | Dev server on http://localhost:3000                                                  |
| `pnpm build` · `pnpm start`                                                            | Production build, and serving it                                                     |
| `pnpm lint` · `pnpm lint:fix`                                                          | ESLint (Next.js rules)                                                               |
| `pnpm format` · `pnpm format:check`                                                    | Prettier: rewrite, or only check                                                     |
| `pnpm typecheck`                                                                       | Generates Next's route types, then `tsc --noEmit`                                    |
| `pnpm check`                                                                           | Lint, formatting, types, migrations, docs and all Vitest suites: run before pushing  |
| `pnpm test`                                                                            | All Vitest suites (unit, db, integration, component, security)                       |
| `pnpm test:unit` · `test:db` · `test:integration` · `test:component` · `test:security` | One suite                                                                            |
| `pnpm test:coverage` · `pnpm test:watch`                                               | Coverage report · watch mode                                                         |
| `pnpm test:e2e` · `pnpm test:e2e:live`                                                 | Browser tests against `pnpm dev` · only the ones that call the real AI               |
| `pnpm db:generate` · `db:migrate` · `db:studio`                                        | New migration from the schema · apply migrations · browse the database               |
| `pnpm db:check`                                                                        | Fails if `schema.ts` has changes no migration covers (no database needed)            |
| `pnpm docs:check`                                                                      | Fails if a doc links to a missing file or heading, or names a missing path or script |
| `pnpm ai:eval` · `ai:chat-eval` · `ai:insights-eval`                                   | Check AI output quality against real providers (after model or prompt changes)       |
| `pnpm check:bundle`                                                                    | After a build: no secret values in files sent to browsers                            |

Every test run also writes its results to `test-<suite>.log` (ignored by git).

## Architecture

```
src/
  app/          routes: landing (/), (app)/ signed-in pages, (legal)/, setup, welcome, api/
  components/   ui/ (shadcn primitives), app/ (shell, nav, error views), one folder per feature
  config/       app name, plans, limits, feature switches, legal details
  lib/          pure helpers shared by client and server (money, dates, validation)
  server/       server only: db/ (schema, migrations runner), auth, session,
                actions/ (server actions), services/ (data access), ai/, billing/
  proxy.ts      optimistic cookie check; real authorization is requireUser()
drizzle/        SQL migrations, generated from src/server/db/schema.ts and committed
tests/          unit/, db/, integration/, component/, security/, e2e/
docs/           project-memory/ (architecture, decisions, rules), DESIGN, TESTING, DEPLOY, RESTORE
```

A page or server action calls `requireUser()`, then services that take
`(db, userId, …)` and scope every query to that user. Server actions are the
app's API; there are only five route handlers (auth, health, export, the daily
job, the payment webhook). Pages render a static shell and stream the
user-specific parts behind `<Suspense>`.

Conventions: money is integer minor units (`src/lib/money.ts`); calendar dates
are `YYYY-MM-DD` strings in the user's time zone (`src/lib/dates.ts`); AI only
ever proposes, and the user confirms through the normal forms. The reasons
behind these and other choices are in [docs/project-memory/](docs/project-memory/README.md)
([architecture](docs/project-memory/architecture.md), [decisions](docs/project-memory/design-decisions.md));
the UI rules are in [docs/DESIGN.md](docs/DESIGN.md).

## Testing

Five Vitest suites run without any external service (Postgres runs in memory
through PGlite; app settings are stripped so no real key is used), plus
Playwright browser tests against the dev server on desktop, iPhone and iPad
sizes. [docs/TESTING.md](docs/TESTING.md) covers what each suite is for and
how to run a single test.

## Working on it

- Branch from `main` and open a pull request. CI (`.github/workflows/ci.yml`)
  runs lint, formatting, type checks, the migration check, every Vitest suite
  and a production build; run `pnpm check` locally first, and `pnpm test:e2e`
  for UI changes.
- Coding agents (and people new to the code) start with [AGENTS.md](AGENTS.md):
  where code goes, the rules, the checks, and what needs the owner's approval.
  Durable knowledge (decisions, business rules, known issues) lives in
  [docs/project-memory/](docs/project-memory/README.md) and is updated in the
  same change as the code.
- Formatting is Prettier's (120 columns); `pnpm format` fixes it. Editors pick
  up `.editorconfig` and the Prettier config.
- Schema changes: edit `src/server/db/schema.ts`, run `pnpm db:generate`, and
  commit the SQL in `drizzle/`. Migrations are applied on deploy (below), so
  write them to work while the previous version is still serving.
- Dependencies are pinned exactly and locked in `pnpm-lock.yaml`; Dependabot
  opens weekly update PRs. Install with `pnpm install --frozen-lockfile` in CI.

## Deployment

**Now: Vercel (Hobby), payments off.** Every push to `main` deploys to
production: `scripts/vercel-build.mjs` applies pending migrations (production
only, never previews), then builds. `vercel.json` runs the functions in
Singapore next to the Neon database and calls `/api/cron/recurring` once a day.
`/api/health` reports whether the app can reach the database, for uptime
monitors. A nightly GitHub Action saves an encrypted database backup.

**Later: own server (Hetzner + Coolify), payments on.** The `Dockerfile` builds
the standalone server; the container applies migrations on start and has a
health check. Vercel's free plan doesn't allow commercial use, hence the move
once payments are on.

Step-by-step guides: [docs/DEPLOY.md](docs/DEPLOY.md) (both setups),
[docs/RESTORE.md](docs/RESTORE.md) (backups), [SECURITY.md](SECURITY.md)
(security model and reporting).
