# Changelog

Significant changes to architecture, behaviour or the development workflow,
newest first. One line each, with the commit; `git log` has the rest. Add a line
when you merge something a future agent should know about.

## 2026-11-09

- Fewer waits before signed-in pages show content: the session and its user
  in one query (Better Auth joins, relations in `schema.ts`), a pool of 10
  connections kept a minute on Vercel (was 3 and 5 s), Insights reads the pay
  dates once and runs its pace queries with the rest, the recurring page
  loads its items once, and Settings' sections load in parallel.
- Insights in pay months (D-038): pick a main income in Settings and the
  month report and check-in run from payday to payday (migration `0011`,
  action `setMainIncome`). Without one, months stay calendar months; the
  check-in before payday then says when last month's income came instead of
  "No income recorded", and points to the setting (`incomeLastMonthOn`).

## 2026-11-02

- Cerebras removed as an AI provider: the free chain is Groq then OpenRouter
  (`.env.example`, privacy page and the AI setting's text; policy date
  2 November). Providers are settings only, so no code changed; a chain entry
  without settings is skipped.
- Previews had production's settings (Vercel ticks Production and Preview by
  default) from 24 October until 2 November; the owner made every secret
  Production-only and replaced the auth, Google, cron, Groq, OpenRouter and
  Sentry secrets. The `staging` branch is set up (D-037).

## 2026-11-01

- Staging (D-037): the `staging` branch gets its own settings, database
  (a Neon branch of development) and Google sign-in; its builds migrate that
  database (`migrationTarget` in `scripts/vercel-build.mjs`) and the branch-name
  check allows it. PageSpeed before and after D-036 recorded (known-issues.md).
- Fonts through `next/font/local` (latin files only, preloaded, size-matched
  fallbacks; 3 font files instead of 13), link-preview image and Open Graph
  tags, `robots.txt` and a sitemap, the site's address from `BETTER_AUTH_URL`
  per request (D-036).
- Security and operations: each nightly backup is restored on the runner and
  checked, and Sentry check-ins catch a missed or failed night (D-033); GitHub
  Actions pinned to commits (`pnpm/action-setup` moves from its `v6` tag to
  v6.1.0), checkouts keep no token, the backup's secrets in the main-only
  `production-backup` environment, a weekly audit (D-034); Settings lists
  signed-in devices and signs out the others, and deleting the account needs a
  Google sign-in from the last 15 minutes (D-035); the privacy page lists what
  each AI feature sends; `docs/ROTATION.md`.
- Engineering: the home page's data in 9 queries (was about 15; recurring items
  read once, `loadDashboard`), light picker lists for the entry dialog and
  filters, foreign-key indexes (migration `0010`), browser tests in CI against a
  production build (D-032), no action queries tables itself (services +
  static guard), direct tests for 9 actions that had none. The CSP asks for
  https upgrades only on pages served over https (Linux WebKit broke on http).

## 2026-10-31

- Entries: search across months, by date range and amount (address-based,
  `src/lib/entry-search.ts`, "Show 200 more"); Undo for 10 minutes after
  deleting an entry (D-030, `deleted_entry`, migration `0009`). Dashboard:
  "safe to spend" after bills still due (`billsLeftThisMonth`, also used by
  the chat). Installable app: manifest and generated icons (D-031).
- Review fixes: currency locked once an account is set up (amounts are saved in
  its smallest unit); a fixed CSP where the proxy doesn't run, so every response
  has exactly one (D-029); raw subqueries over entries scoped to the user (they
  read every user's entries); unexpected database errors no longer shown as
  "That wallet doesn't exist."; duplicates recognised by Postgres code and
  constraint (`rethrowUnique`).
- Existing accounts' category colors brought under D-028 by the owner with
  `pnpm categories:recolor`: development 75 categories in 3 accounts,
  production 53 in 2; a dry run afterwards reported 0 on both.
- Category colors look different from each other (D-028): a new category starts
  with a random distinct color (Shuffle for more); the server refuses look-alikes
  per kind (ΔE 10, then the best still free); new defaults re-picked;
  `pnpm categories:recolor` brings existing accounts under the rule once.
- Nonce-based CSP (D-027, supersedes D-012): `src/proxy.ts` gives every page a
  fresh nonce, `'unsafe-inline'` is gone from `script-src`, and every page now
  renders per request (no static shells). `PW_PROD=1` runs the browser tests
  against a production build.
- Better Auth's `update-user` endpoint is switched off (`disabledPaths`): the
  app never used it, and it accepted any name length and image URL. The
  deferred "display name and avatar unvalidated" item is closed.
- Rate limiting (D-026, replacing D-018's deferral): every server action but
  four counts against 120 calls per minute per user (`action_rate`), and Better
  Auth's sign-in limits are counted in the database (`rate_limit`); migration
  `0008_rate_limits`. `runAction` now takes the user id.
- Cross-user tests now cover every action that takes ids or keys (added:
  alerts, subscription suggestions, setup, all billing actions) and the
  insight report's facts; every action must be on a reviewed list in
  `tests/security/access-control.test.ts`, so a new one fails until reviewed.
- Live site's security headers checked from outside by the owner (`curl -sI`):
  all six match the production values in `src/lib/security-headers.ts`.

## 2026-10-26

- Vercel settings confirmed by the owner: Node 24.x, Fluid compute on,
  previews without the production `DATABASE_URL`. The roadmap's uptime monitor
  proposal is done (UptimeRobot, docs/OBSERVABILITY.md).
- TypeScript 6.0.3 (Dependabot #3; no code or config changes needed).
  Dependabot no longer proposes `@types/node` majors: they must follow the
  Node 24 runtime (#4 closed for that reason).
- Git hooks (`.githooks/`, D-025): pre-commit (not on `main`; Prettier and
  ESLint on staged files), pre-push (branch name, `pnpm check`), post-merge
  (install reminder). Branch names `<type>/<short-description>`, enforced in CI
  on pull requests.
- `main` is protected: changes go through pull requests, and CI's `checks` job
  must pass on an up-to-date branch before a merge (and so a deploy).
- Sentry switched on in production and checked end to end (test error, source
  maps, alert email). Fixes: handled errors weren't reported (the logger's
  reporter wasn't shared across bundles; `40ef54d`). Added error-only session
  replay, fully masked and paused on addresses with a query string (D-024).
- Observability (D-024, [docs/OBSERVABILITY.md](../OBSERVABILITY.md)): a
  structured, redacted logger replaces `console.*` on the server; request ids;
  `/api/health/live` beside the readiness check (now with a 3 s timeout; the
  Docker health check uses liveness); Sentry for errors, traces, Web Vitals and
  the daily job's check-ins, off until `NEXT_PUBLIC_SENTRY_DSN` is set; `/admin`
  can send a test error; the privacy page mentions Sentry when it's on.
- Independent maintainability assessment: dismissed subscription suggestions now
  count toward the daily dismissal limit; writes after an ownership check also
  filter by `userId`; CI runs `pnpm audit --audit-level=high` (D-023); a settings
  drift test; agent worktrees ignored by git and ESLint; e2e cleanup removes AI
  usage counters; more ask rules in `.claude/settings.json`; docs corrected
  against the code (`97daa50`, docs in the next commit).

## 2026-10-25

- Agent tools: Next.js dev-server MCP (`.mcp.json`, pinned `next-devtools-mcp`)
  and Next's `next-bundle-optimizer` skill (decision D-022) (`8148e9b`).
- Agent instructions and this project memory (`AGENTS.md`, `CLAUDE.md`,
  `.claude/`, `docs/project-memory/`); `pnpm db:check` and `pnpm docs:check` in CI (`85300c0`).
- Dependabot: `react`/`react-dom` 19.3.1 (`cac5aa9`), `upload-artifact` v7 in the backup workflow (`004d025`).
- Team workflow: Prettier, CI on GitHub Actions, `pnpm check`, `typecheck` runs
  `next typegen`, exact dependency pins, README and architecture docs (`e69ba32`, reformat `b0b6836`).
- Per-account limits on how much one account can create (`12c24b3`).
- Security test suite `tests/security/` (`adaf604`).
- Review fixes: `/ask?q=` links no longer send questions; sign-out as a server
  action; faster money formatting (`8214053`).
- Integration and component tests, AI off by default in browser tests,
  `@live-ai` tag, focused test scripts (`6f11046`).
- Forms keep typed values after errors (`useFormAction`); only real currency
  codes accepted (`92dc43f`).
- Test runs write `test-<suite>.log` with live terminal output (`510bc77`).
- Reliability: `callAction`, validated external responses, safe config parsing (`30a7a15`).
- Error and 404 pages, tablet layout, accessibility pass (`f7eb35f`).
- Database pool timeouts (`68f9094`); shared logic centralised (`1b0ece5`).
- Security headers and CSP, Dependabot (`902bacc`).

## 2026-10-24

- Live on Vercel with payments switched off; nightly backups; restore guide (`480d15a`, `c641b3d`).
- Milestones 2–8: wallets, entries and categories; budgets, goals and the
  dashboard; recurring items and subscriptions; AI entry and categories; guided
  setup and the money chat; Pro plan, Razorpay and insights; legal pages,
  export, account deletion and admin (`1f856d6` … `71ed47a`).

## 2026-10-23

- Milestone 1: scaffold, Google sign-in, database and app shell (`30ca6e0`).
