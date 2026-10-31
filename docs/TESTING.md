# Testing

Two tools: **Vitest** for everything that runs in Node (including React
components in jsdom), and **Playwright** for the browser. Every run writes a
plain-text copy of its results to `test-<type>.log` at the repo root (ignored by
git), while the terminal output stays live.

## Running the tests

| Command                 | What runs                                                         | Needs                        | Log                    |
| ----------------------- | ----------------------------------------------------------------- | ---------------------------- | ---------------------- |
| `pnpm test`             | All Vitest suites below                                           | nothing                      | `test-unit.log`        |
| `pnpm test:unit`        | `tests/unit`: pure logic (money, dates, plans, AI fallback…)      | nothing                      | `test-unit.log`        |
| `pnpm test:db`          | `tests/db`: services on an in-memory Postgres (PGlite)            | nothing                      | `test-db.log`          |
| `pnpm test:integration` | `tests/integration`: server actions and route handlers on PGlite  | nothing                      | `test-integration.log` |
| `pnpm test:component`   | `tests/component`: React components in jsdom                      | nothing                      | `test-component.log`   |
| `pnpm test:security`    | `tests/security`: app-wide sweeps of the security rules (below)   | nothing                      | `test-security.log`    |
| `pnpm test:coverage`    | All Vitest suites with coverage (`coverage/index.html`)           | nothing                      | `test-unit.log`        |
| `pnpm test:watch`       | Vitest in watch mode                                              | nothing                      | `test-unit.log`        |
| `pnpm test:e2e`         | `tests/e2e`: Playwright on desktop Chrome and iPhone (iPad: tour) | `.env.local`, a dev database | `test-e2e.log`         |
| `pnpm test:e2e:live`    | Only the e2e tests that call the real AI provider (`@live-ai`)    | the same, plus an AI key     | `test-e2e.log`         |

Before every push, the pre-push git hook runs `pnpm check` (README, "Working on
it"). A single file or test: `pnpm vitest run tests/integration/routes.test.ts -t "export"`
(writes its folder's log, here `test-integration.log`),
`pnpm test:e2e smoke.spec.ts --project desktop-chrome`.

### Vitest suites never touch real services

`tests/stubs/clean-env.ts` removes the app's settings (database URL, AI and
Razorpay keys, Sentry settings, secrets) from the environment before any test runs, even if
your shell has them exported. The database is PGlite in memory, created fresh
for each test file from the real migrations. In integration tests only the
outside world is replaced: the session (`@/server/session`), Next's
`cookies`/`headers`/`refresh`, Better Auth's sign-out, and Razorpay's API calls
(the signature checks stay real). All data is made in the test, with fixed
dates and amounts.

### End-to-end tests

Playwright starts `pnpm dev` (or reuses one already running on :3000). The tests
sign in with Better Auth's test helpers, so they need `.env.local` with
`DATABASE_URL` and `BETTER_AUTH_SECRET`. Each test creates its own throwaway
user (`e2e-<uuid>@example.test`) and deletes it afterwards; no real account is
used.

- **Point `.env.local` at a development database, never production.** The tests
  write to `DATABASE_URL`: from your shell if it's set there, otherwise from
  `.env.local`. A separate Neon branch for development is the safest setup.
- **AI is off for test users by default**, so the tests never reach the AI
  provider by accident (the entry form asks it for a category as soon as a
  description is typed). Tests about AI switch it on with `test.use({ ai: true })`.
- **Tests that really call the AI provider are tagged `@live-ai`** and are left
  out unless `LIVE_AI=1` is set (`pnpm test:e2e:live`). Their results depend on a
  model and its rate limits, so they're a manual check, e.g. after changing
  models. `LIVE_AI=1 pnpm test:e2e` runs everything, including the Pro report
  screenshot in the visual tour.
- Tests that need payments switched on skip themselves unless `BILLING_ENABLED`
  is `"true"` in `.env.local`, and the reverse.
- `PW_WORKERS=4 pnpm test:e2e` changes the number of parallel browsers (default:
  75% of CPU cores).
- `PW_PROD=1 pnpm test:e2e` builds and runs the production server instead of
  `pnpm dev` (port 3000 must be free). Pages render differently there (D-027),
  so run at least `PW_PROD=1 pnpm test:e2e security.spec.ts` after changing the
  CSP, the proxy or the root layout.
- The visual tour saves screenshots of every page to `tests/e2e/.tour/` for design review.

## What each layer is for

- **Unit:** rules that are easy to get subtly wrong: money parsing and
  rounding, month boundaries and time zones, plan resolution, the AI fallback
  chain, webhook payload checks; and observability: log redaction
  (`log.test.ts`), request ids, `onRequestError` and the admin test error
  (`observability.test.ts`), and what Sentry would receive, through the real SDK
  with the app's server setup and an in-memory transport (`monitoring.test.ts`). (AI quotas are tested in `tests/db/ai.test.ts`,
  security headers in `tests/security/headers.test.ts`.)
- **DB (PGlite):** services and queries against real Postgres: balances and
  transfers, budgets across months, recurring entries without duplicates,
  webhook idempotency, chat tools that only see the user's own rows.
- **Integration:** the main server actions and every route doing their job (not
  every action has its own test yet; see known-issues.md): success,
  validation errors, unknown operations, checkout and webhook handling, and
  failures from Razorpay or the database coming back as plain messages
  without details. (The app-wide access sweeps are in the security suite.)
- **Component:** what a person sees when something goes wrong in a form, the
  chat or a toggle: a failed send keeps what they typed, a server refusal is
  shown, a switch goes back if saving fails.
- **Security:** the security rules, checked across the whole app rather than
  feature by feature. The sweeps catch a new action without a session check, an
  unreviewed route, a signed-in page that doesn't check the session, client
  code importing server code, and an action nobody has reviewed for other
  users' records or for the rate limit. Each file names the threat it covers:
  - `access-control`: every server action refuses without a session (found
    automatically) and is on a reviewed list saying why it can't reach another
    user's records, so a new action fails until it's added. Every action that
    takes ids or keys (wallets, categories, goals, recurring items, budgets,
    entries, alerts, subscription suggestions, setup, billing) is tried with
    another user's, and each refusal must be the ownership check, not a form
    error; insight reports are built only from the user's own records;
    slipped-in ownership fields are ignored.
  - `rate-limit`: every server action counts against the per-user limit per
    minute or is on a reviewed exempt list; over the limit, it stops before
    doing anything and returns its usual failure instead of throwing (D-026).
  - `settings`: every setting in `.env.example` is removed before tests run (or
    is harmless), and every one `src/env.ts` validates is documented.
  - `routes`: every route handler is on a reviewed list with who may call it,
    and is called anonymously to prove it. A new route fails until it's added.
  - `auth`: Better Auth as configured, through its HTTP handler with production
    checks on: cross-site requests and outside callback URLs are refused,
    forged cookies don't work, the client can't change the user at all
    (update-user is off) or the email, password sign-up is off, and sign-in is
    limited per address.
  - `static`: rules on the source: server actions live only where the sweep
    looks, client code never imports server code or secrets, every signed-in
    page checks the session, redirects go only to fixed paths, raw HTML and
    raw SQL only in reviewed places, no eval.
  - `output`: AI text (chat answers, insights) renders as text, never as HTML,
    links or scripts.
  - `headers`: the CSP and other security headers, and the proxy giving each
    page request its own nonce (D-027).
    The browser side (headers on real responses, every script carrying the
    response's nonce, the app working under the CSP) is
    `tests/e2e/security.spec.ts`; secrets in the built bundle are checked by
    `pnpm check:bundle` after a build.
- **E2E:** the main journeys in a real browser, on desktop and mobile: sign-in
  redirect, onboarding, entries, wallets and transfers, budgets and alerts,
  goals, recurring items, export, account deletion, security headers and CSP,
  keyboard and reduced-motion access, and a save that fails on the network.
