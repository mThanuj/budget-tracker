# Architecture and decisions

How ClearPaisa is put together, and why. Each decision says what was chosen,
the reason, and what it costs, so a later change can weigh the same things.
When a decision changes, edit its entry and say what replaced it.

## How a request flows

1. `src/proxy.ts` sends visitors without a session cookie to the landing page.
   It only looks for the cookie; it doesn't verify it.
2. The page renders a static shell, prerendered at build time. Everything that
   depends on the user sits behind `<Suspense>` and streams in.
3. That part calls `requireUser()` (`src/server/session.ts`), which verifies the
   session with Better Auth and redirects if there isn't one, then calls
   services (`src/server/services/*`) with `(db, userId, …)`.
4. Changes go through server actions (`src/server/actions/*`): `requireUser()`,
   validate the input with Zod (`src/lib/validation.ts`), call a service,
   `refresh()`. Expected failures come back as a result the form shows
   (`runAction`); anything else is a bug and reaches the error boundary.
5. Client code calls actions through `callAction()` (`src/lib/call-action.ts`),
   so a request that never reached the server shows "didn't go through" in place
   instead of an error page.

## Decisions

### Next.js App Router with Cache Components

Pages are static shells with streamed, per-user content. _Why:_ fast first paint
from the CDN for every page, without caching anything user-specific.
_Cost:_ code that reads the session must sit under `<Suspense>`, and anything
that makes a response dynamic (a CSP nonce, for one) would undo it.

### Server actions are the API; services own data access

There's no REST layer: forms and buttons call server actions. Every action
calls `requireUser()` and every service query is scoped by `userId`, and ids
from the client are checked for ownership. _Why:_ one place to enforce access,
typed end to end. _Cost:_ actions are public endpoints that accept anything, so
each validates its arguments; `tests/security/` checks every action and route
so a new one can't skip this.

### Google sign-in only, through Better Auth

No passwords to store, reset or leak. The app's own user fields (currency,
time zone, AI switch, default wallet) are marked `input: false`, so only our
server actions can change them. _Cost:_ people without a Google account can't
sign up.

### Postgres on Neon, Drizzle ORM, committed migrations

SQL migrations are generated from `src/server/db/schema.ts` and committed in
`drizzle/`. On Vercel they're applied by the production build
(`scripts/vercel-build.mjs`), in the Docker image when the container starts
(`src/instrumentation.ts`). _Why:_ the schema in git is the schema in
production. _Cost:_ a migration runs while the previous version is still
serving, so changes must be backward compatible (add, then remove later).

### Money as integer minor units, dates as strings

Amounts are stored as integers in the currency's smallest unit, with the number
of decimals taken from the currency. Calendar dates are `YYYY-MM-DD` strings in
the user's time zone, and months are ranges of those strings. _Why:_ no
floating-point rounding, and "today" means the user's today. _Cost:_ convert at
the edges (`src/lib/money.ts`, `src/lib/dates.ts`).

### AI is optional, proposes only, and uses a privacy-safe fallback chain

Every AI feature has a manual path. The AI fills in forms or suggests; the user
confirms and normal actions save. Providers are OpenAI-compatible APIs that
don't train on the data, tried in order (`LLM_CHAIN_*`), with per-user and
global daily quotas stored in the database. _Why:_ free tiers are rate-limited
and change often; nothing must depend on them. _Cost:_ answers vary by model,
so AI quality is checked with the `ai:*` eval scripts, not unit tests.

### Payments behind a switch, reconciled from Razorpay

`BILLING_ENABLED` turns plans and payments on. Webhooks are verified, stored
once per event id, and the subscription's state is always fetched from
Razorpay rather than trusted from the payload. _Why:_ events arrive twice or
out of order. _Cost:_ each webhook makes one API call to Razorpay.

### Hosting: Vercel now, own server once payments are on

The free launch runs on Vercel Hobby in Singapore (next to the Neon database),
with a daily cron and nightly encrypted backups by GitHub Actions. Vercel's
free plan isn't for commercial use, so with payments on the plan is a Docker
image on Hetzner with Coolify (`Dockerfile`, docs/DEPLOY.md Part 2).

### Security model

A CSP that allows inline scripts (Next's bootstrap scripts are inline, and a
nonce would make every page dynamic) but locks down where scripts load from;
per-account limits on how much one account can create (`src/config/limits.ts`)
as database counts, since there's no shared store for rate limiting yet.
Details and deferred items: [SECURITY.md](../SECURITY.md).

### Testing without external services

Database tests use PGlite (real Postgres in memory) with the real migrations;
integration and security tests run the real actions and routes against it, with
only the session, Next's request APIs and outside services replaced. Browser
tests run against the dev server with throwaway users, AI off unless a test
opts in, and tests that call the real AI only with `LIVE_AI=1`.
See [TESTING.md](TESTING.md).

### Tooling

ESLint with Next's rules (`eslint.config.mjs`), Prettier for formatting (120
columns), TypeScript strict, exact dependency versions with a lockfile and
Dependabot, and GitHub Actions running all of it on every pull request.
