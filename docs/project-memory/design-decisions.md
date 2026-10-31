# Design decisions

Decisions that shape the code, newest status first in the index. Each entry
says what was decided and why, so a later change can weigh the same things.
Dates come from the commit that introduced the decision (`git show <hash>`).
"Rationale: not recorded" means the code shows the choice but nothing written
down explains it; don't invent a reason, ask the owner if it matters.

Template for a new entry (copy it to the end, take the next number):

```markdown
### D-NNN Title

- **Status:** proposed | accepted | superseded by D-NNN | deprecated · **Date:** YYYY-MM-DD
- **Context:** the problem or requirement.
- **Decision:** what was chosen.
- **Rationale:** why. **Alternatives:** what else was considered, and why not.
- **Trade-offs / consequences:** costs, and rules future code must follow.
- **Affected:** files or areas. **References:** commits, tests, docs.
```

When a decision changes, don't edit history away: set the old entry's status
to "superseded by D-NNN", add the new entry, and say what changed.

| ID    | Decision                                                                 | Status                                 |
| ----- | ------------------------------------------------------------------------ | -------------------------------------- |
| D-001 | Product scope: beginners, wallets, AI assistant, Free + Pro              | accepted                               |
| D-002 | Next.js 16 App Router with Cache Components                              | accepted; static shells ended by D-027 |
| D-003 | Better Auth with Google sign-in only                                     | accepted                               |
| D-004 | Neon Postgres with Drizzle; committed migrations applied on deploy       | accepted                               |
| D-005 | Server actions are the API; services own data access                     | accepted                               |
| D-006 | Money in integer minor units; dates as strings in the user's time zone   | accepted                               |
| D-007 | AI is optional, only proposes, and uses a privacy-safe fallback chain    | accepted                               |
| D-008 | Razorpay subscriptions, reconciled from Razorpay's API                   | accepted                               |
| D-009 | Hosting on Hetzner + Coolify from the start                              | superseded by D-010                    |
| D-010 | Launch free on Vercel Hobby with payments switched off                   | accepted                               |
| D-011 | Nightly encrypted backups by GitHub Actions, kept 7 days                 | accepted                               |
| D-012 | CSP allows inline scripts to keep static rendering                       | superseded by D-027                    |
| D-013 | No client form or data-fetching library                                  | accepted                               |
| D-014 | Forms submit through `useFormAction`, not `<form action>`                | accepted                               |
| D-015 | Client calls go through `callAction` (no error page on a failed request) | accepted                               |
| D-016 | Sign-out is a server action, not Better Auth's browser client            | accepted                               |
| D-017 | A link can't make the app act for the user                               | accepted                               |
| D-018 | Per-account limits as database counts; request rate limiting deferred    | accepted; deferral superseded by D-026 |
| D-019 | Tests never use outside services; app-wide security sweeps               | accepted                               |
| D-020 | Prettier, CI on GitHub Actions, exact dependency pins                    | accepted                               |
| D-021 | Agent instructions and project memory in the repo; no MCP or hooks       | accepted; MCP part superseded by D-022 |
| D-022 | Next.js dev-server MCP and bundle-optimizer skill for agents             | accepted                               |
| D-023 | CI fails on high or critical dependency advisories                       | accepted                               |
| D-024 | Observability: structured logs, Sentry, health checks                    | accepted                               |
| D-025 | Plain git hooks; branch names checked in CI                              | accepted                               |
| D-026 | Per-user action rate limit and Better Auth's limiter, both in Postgres   | accepted                               |
| D-027 | Nonce-based CSP; every page renders per request                          | accepted                               |
| D-028 | Category colors look different from each other, enforced by the server   | accepted                               |

### D-001 Product scope

- **Status:** accepted · **Date:** 2026-10-23
- **Decision:** a public budget tracker for people new to managing money:
  Google sign-in, one tracking currency per user, user-created wallets with
  transfers, categories, monthly budgets, savings goals, recurring bills and
  subscription tracking, in-app alerts only, an AI assistant (entry from a
  sentence, category suggestions, guided setup, money chat, monthly insights).
  English only; desktop and mobile treated equally. Free and Pro plans, Pro
  adding higher AI limits and the insights write-up; everything else free.
- **Rationale:** agreed with the owner in the original plan (kept outside the
  repo, not versioned). **Affected:** the whole app. **References:** `30ca6e0`.

### D-002 Next.js 16 App Router with Cache Components

- **Status:** accepted; the static shells it aimed for were given up by D-027 (2026-10-31) · **Date:** 2026-10-23
- **Decision:** App Router, `cacheComponents` and `partialPrefetching` on
  (`next.config.ts`), `src/proxy.ts` for the optimistic cookie check.
- **Rationale:** a static shell for every page from the CDN, with per-user
  content streamed, without caching anything user-specific.
- **Consequences:** user-specific code sits under `<Suspense>`; anything that
  forces dynamic documents (a CSP nonce) undoes this (see D-012). APIs differ
  from older Next versions: check `node_modules/next/dist/docs/`.
- **References:** `30ca6e0`, [implementation-notes.md](implementation-notes.md#nextjs-16).

### D-003 Better Auth with Google sign-in only

- **Status:** accepted · **Date:** 2026-10-23
- **Decision:** Better Auth (Drizzle adapter, `nextCookies` plugin), Google as
  the only provider; email/password, change-email and delete-user off; the
  app's user fields (`currency`, `timezone`, `onboardedAt`, `aiEnabled`,
  `defaultWalletId`) are `input: false`.
- **Rationale:** no passwords to store or leak. **Alternatives:** next-auth v5,
  rejected in the original plan (kept outside the repo) because it was still in beta.
- **Consequences:** people without a Google account can't sign up; only our
  server actions change app fields. **Affected:** `src/server/auth.ts`,
  `session.ts`. **References:** `tests/security/auth.test.ts`.

### D-004 Neon Postgres with Drizzle; committed migrations

- **Status:** accepted · **Date:** 2026-10-23
- **Decision:** Postgres on Neon, Drizzle ORM with node-postgres (`pg` Pool),
  SQL migrations generated into `drizzle/` and committed. Applied by the
  production build on Vercel (`scripts/vercel-build.mjs`) and on container start
  in the Docker image (`src/instrumentation.ts`, `RUN_MIGRATIONS=1`).
- **Alternatives:** Prisma, rejected in the original plan (kept outside the
  repo): its latest major was an incompatible release candidate at the time.
- **Consequences:** the previous version keeps serving while a migration runs,
  so migrations must be backward compatible. `pnpm db:check` fails when the
  schema and migrations disagree. **References:** `30ca6e0`, `480d15a`.

### D-005 Server actions are the API; services own data access

- **Status:** accepted · **Date:** 2026-10-23
- **Decision:** no REST layer. Every action calls `requireUser()`; services take
  `(db, userId, …)` and scope every query; ids from the client are ownership
  checked. Route handlers only where something outside the app calls in.
- **Rationale:** one enforced place for access control, typed end to end.
- **Consequences:** actions are public endpoints that accept anything; each
  validates its input. **References:** [architecture.md](architecture.md),
  `tests/security/access-control.test.ts`, `routes.test.ts`.

### D-006 Money in minor units, dates as strings

- **Status:** accepted · **Date:** 2026-10-23
- **Decision:** integer minor units with the number of decimals from the
  currency (`Intl`); calendar dates as `YYYY-MM-DD` in the user's time zone.
- **Rationale:** no floating-point rounding; "today" is the user's today.
- **Consequences:** convert at the edges with `src/lib/money.ts` and `dates.ts`.

### D-007 AI optional, proposes only, privacy-safe fallback chain

- **Status:** accepted · **Date:** 2026-10-24
- **Decision:** every AI feature has a manual path; AI fills forms or suggests,
  the user confirms and normal actions save. Providers are OpenAI-compatible
  APIs that don't train on the data (no Gemini free tier), tried in order from
  `LLM_CHAIN_FREE` / `LLM_CHAIN_PRO`, skipping one that fails; per-user and
  global daily quotas in `ai_usage`.
- **Rationale:** free tiers are rate-limited and change often; nothing must
  depend on them. **Consequences:** output quality is checked with the `ai:*`
  eval scripts and `pnpm test:e2e:live`, not unit tests.
- **References:** `4237139`, `117b72f`, `src/server/ai/`.

### D-008 Razorpay subscriptions, reconciled from the API

- **Status:** accepted · **Date:** 2026-10-24
- **Decision:** Razorpay Subscriptions (UPI Autopay and cards). Webhooks are
  HMAC-verified, recorded once per event id, and the subscription's state is
  fetched from Razorpay rather than trusted from the payload. Cancelling keeps
  Pro until the paid period ends.
- **Rationale:** events can arrive twice or out of order.
- **References:** `3b03169`, `src/server/billing/`, `tests/db/billing.test.ts`.

### D-009 Hosting on Hetzner + Coolify from the start

- **Status:** superseded by D-010 (2026-10-24) · **Date:** 2026-10-23
- **Decision:** a Hetzner VPS with Coolify, because Vercel's free plan doesn't
  allow commercial use and payments were planned from the start.
- **What changed:** the owner chose to launch free first. The Docker image and
  the guide (docs/DEPLOY.md Part 2) are kept for when payments go on.

### D-010 Launch free on Vercel Hobby, payments off

- **Status:** accepted · **Date:** 2026-10-24
- **Decision:** deploy to Vercel Hobby in Singapore (`vercel.json` `regions:
["sin1"]`, next to the Neon database), with `BILLING_ENABLED=false` so
  everyone is on Free and nothing about payments shows. Recurring entries are
  recorded by a daily cron (the most Hobby allows) and on page loads.
- **Rationale:** the owner's decision, to launch without the server and
  payment setup. **Consequences:** turning payments on means moving hosting
  (D-009's plan, docs/DEPLOY.md Part 2) and Razorpay live mode.
- **References:** `480d15a`, `src/config/features.ts`.

### D-011 Nightly encrypted backups, kept 7 days

- **Status:** accepted · **Date:** 2026-10-24
- **Decision:** a GitHub Action dumps the production database each night,
  encrypts it (AES-256, passphrase in repo secrets) and keeps it 7 days.
- **Rationale:** Neon's free plan keeps only 6 hours of history; the privacy
  policy promises deleted data leaves backups within 7 days.
- **References:** `480d15a` (workflow), `c641b3d` (restore guide), `.github/workflows/backup.yml`, docs/RESTORE.md.

### D-012 CSP allows inline scripts

- **Status:** superseded by D-027 · **Date:** 2026-10-25
- **Decision:** `script-src 'self' 'unsafe-inline'` (plus Razorpay), with
  `base-uri`, `object-src`, `frame-ancestors` and `form-action` locked down.
- **Alternatives:** a nonce-based CSP, rejected: Next's bootstrap scripts are
  inline, and a per-request nonce makes every page dynamic (undoing D-002).
- **References:** `902bacc`, `src/lib/security-headers.ts`, SECURITY.md.

### D-013 No client form or data-fetching library

- **Status:** accepted · **Date:** 2026-10-24 (as built)
- **Decision:** forms are plain `<form>`s posting to server actions, validated
  on the server with the Zod schemas in `src/lib/validation.ts`; pages read data
  on the server. No react-hook-form, SWR, React Query or state library.
- **Rationale:** not recorded. The original plan listed react-hook-form; it was
  never added. Don't add one without a decision here.

### D-014 Forms submit through `useFormAction`

- **Status:** accepted · **Date:** 2026-10-25
- **Context:** React 19 resets a `<form action={…}>` after every submit, even
  when the action returned a validation error, so people lost what they typed.
- **Decision:** `useFormAction` submits from `onSubmit` inside a transition;
  the `action` prop stays on the form so a submit before hydration still does
  nothing, as React intends (see the hook's comment).
- **Alternatives:** restoring `defaultValue`s before the reset (React re-applies
  them), controlled inputs everywhere (more code in every form).
- **References:** `92dc43f`, `src/components/ui-extra/use-form-action.ts`,
  `tests/component/wallet-form.test.tsx`.

### D-015 Client calls go through `callAction`

- **Status:** accepted · **Date:** 2026-10-25
- **Context:** a failed server action call inside a transition replaces the
  page with the error screen.
- **Decision:** `callAction()` catches it and returns `NOT_SENT` (with a toast
  unless `notify: false`); Next's redirect and not-found signals are re-thrown.
- **References:** `30a7a15`, `src/lib/call-action.ts`.

### D-016 Sign-out is a server action

- **Status:** accepted · **Date:** 2026-10-25
- **Decision:** `signOut()` in `src/server/actions/account.ts` calls Better
  Auth on the server and redirects. **Rationale:** Better Auth's browser client
  was loaded on every signed-in page (~12 kB gzip) for this one button, and a
  failed sign-out went unnoticed. The Google sign-in button still uses it.
- **References:** `8214053`.

### D-017 A link can't make the app act for the user

- **Status:** accepted · **Date:** 2026-10-25
- **Context:** `/ask?q=…` sent the question on load, so any link could spend a
  user's daily AI questions and put someone else's text in front of the model.
- **Decision:** side effects need a click. The home page's ask box hands its
  question over in memory (`src/components/ask/handover.ts`); a question that
  arrives only in the URL is filled in, not sent.
- **References:** `8214053`, `tests/component/chat-panel.test.tsx`, `tests/e2e/ai.spec.ts`.

### D-018 Per-account limits; request rate limiting deferred

- **Status:** accepted; the deferral of rate limiting is superseded by D-026 · **Date:** 2026-10-25
- **Decision:** caps on how much one account can create (`src/config/limits.ts`),
  checked by counting in the same database. Rate limiting of requests waits for
  a shared store (an in-memory limiter is per instance on serverless).
- **Rationale:** one scripted account could otherwise fill the shared database.
- **References:** `12c24b3`, `tests/db/limits.test.ts`, SECURITY.md.

### D-019 Tests never use outside services

- **Status:** accepted · **Date:** 2026-10-25
- **Decision:** Vitest suites run on PGlite with real migrations and strip app
  settings; integration and security tests run real actions and routes with
  only the session, Next's request APIs and outside services replaced.
  `tests/security/` sweeps every action, route and page. Browser tests use
  throwaway users with AI off unless a test opts in; tests that call the real
  AI are tagged `@live-ai` and run only with `LIVE_AI=1`.
- **References:** `6f11046`, `adaf604`, docs/TESTING.md.

### D-020 Prettier, CI, exact pins

- **Status:** accepted · **Date:** 2026-10-25
- **Decision:** Prettier (120 columns) with ESLint's Next rules; GitHub Actions
  runs install, lint, formatting, types, tests and a build on every PR and push
  to `main` (D-021 added the migration and docs checks, D-023 the audit); direct dependencies pinned exactly, updated by
  Dependabot. Since 2026-10-26 `main` is protected (owner's setting in GitHub):
  pull requests only, the `checks` job must pass on an up-to-date branch, no
  bypass for admins. **References:** `e69ba32`, `.github/workflows/ci.yml`.

### D-021 Agent instructions and project memory in the repo

- **Status:** accepted; the "no MCP server" part superseded by D-022 (same day) · **Date:** 2026-10-25
- **Context:** coding agents work on this repo across sessions and tools; some
  knowledge (open issues, provider quirks, test conventions) lived only in one
  tool's private memory.
- **Decision:** `AGENTS.md` holds the shared rules (Next's managed block stays
  at the top); `CLAUDE.md` imports it and adds Claude Code specifics;
  `docs/project-memory/` is the canonical memory, updated in the same change as
  the code; recurring workflows are Claude Code skills in `.claude/skills/`
  (plain Markdown any agent can follow); `.claude/settings.json` denies reading
  real `.env` files and asks before pushes, merges, migrations and paid AI runs;
  `pnpm db:check`, `pnpm docs:check` and a PR template join the gates.
- **Alternatives:** `next-devtools-mcp` (Next's official dev-server MCP: useful,
  but needs a reachable local dev server and downloads the package on each run;
  left opt-in per developer); Next's published skills (optional, e.g.
  `next-bundle-optimizer` for performance work); a database MCP server
  (rejected: direct database access for agents; `pnpm db:studio` on the
  development database covers inspection); git hooks (rejected: a new
  dependency, and CI plus `pnpm check` already run the same checks); a vector
  store or external memory service (rejected: Markdown in git is enough).
- **Consequences:** the memory review is part of finishing a task. Claude Code
  settings bind only Claude Code; the approval points in `AGENTS.md` apply to
  every agent. **References:** `AGENTS.md`, `CLAUDE.md`, `.claude/`,
  `docs/project-memory/README.md`.

### D-022 Next.js dev-server MCP and bundle-optimizer skill

- **Status:** accepted · **Date:** 2026-10-25 · **Supersedes:** D-021's "no MCP server"
- **Context:** the owner then allowed the optional integrations D-021 had left
  out. Two were judged useful; the rest are already covered (Playwright for
  browser checks, `pnpm db:studio` for the development database).
- **Decision:** `next-devtools-mcp` (Vercel's official server) is a pinned dev
  dependency, started by `.mcp.json` with `pnpm exec` and telemetry off
  (`NEXT_TELEMETRY_DISABLED=1`). It lets an agent read the running dev server's
  errors, routes and logs. Next's `next-bundle-optimizer` skill is copied
  unchanged from the `v16.4.2` tag into `.claude/skills/` after review
  (`PROVENANCE.md`), and kept out of Prettier.
- **Alternatives:** `npx next-devtools-mcp@latest` as Next's docs suggest
  (rejected: downloads and runs whatever is latest on each start; the pinned
  dev dependency is locked, audited and updated by Dependabot); `next-dev-loop`
  (needs the separate `agent-browser` CLI; not added); a database MCP server
  (still rejected, as in D-021).
- **Trade-offs / consequences:** the MCP server only reaches local dev servers
  (development data), keeps a debug log in `~/.next-devtools-mcp/mcp.log`, and
  each person's agent client asks before enabling it. Changes to `.mcp.json`,
  `.claude/settings.json` or skills change what agents can do: owner review.
  Update the vendored skill when `next` is upgraded.
- **Overrides:** `next-devtools-mcp` 0.4.0 pins an MCP SDK (1.25.2) and zod
  (3.25.76) with published advisories (5 high). `pnpm-workspace.yaml` overrides
  them for that package to `@modelcontextprotocol/sdk` 1.32.2 and zod 4.6.7 (the
  app's version), which brought `pnpm audit` back to its one accepted moderate
  item. Checked: tool schemas, `nextjs_docs` and argument validation still work.
  Remove the overrides when a `next-devtools-mcp` release depends on fixed versions.
- **Affected:** `.mcp.json`, `package.json`, `.claude/skills/next-bundle-optimizer/`.

### D-023 CI fails on high or critical dependency advisories

- **Status:** accepted · **Date:** 2026-10-26
- **Context:** the independent assessment found nothing checked advisories
  automatically; the MCP SDK's high advisories (D-022) were noticed only because
  `pnpm audit` was run by hand.
- **Decision:** CI runs `pnpm audit --audit-level=high` on every PR and push.
  Moderate and low ones don't fail the run; they're reviewed by hand and listed
  in [known-issues.md](known-issues.md).
- **Alternatives:** failing on any advisory (the accepted moderate `esbuild` one
  would block everything); relying on Dependabot alerts alone (they don't stop
  a merge).
- **Trade-offs / consequences:** a newly published advisory can fail a PR that
  didn't change dependencies; fix it (upgrade or a scoped override, as in D-022)
  or record why it's accepted. The audit needs the registry, so CI needs network.
- **Affected:** `.github/workflows/ci.yml`.

### D-024 Observability: structured logs, Sentry, health checks

- **Status:** accepted · **Date:** 2026-10-26
- **Context:** the live site had no error monitoring, unstructured
  `console.error` lines that Vercel Hobby keeps only briefly, one health check
  that queried the database, and no alerts. The owner asked for errors,
  slowness and a missed daily job to be detected and actionable, with privacy
  safeguards and no new costs, and approved Sentry's free plan, its browser SDK
  (with the CSP change), a privacy-policy line, one production test error and
  an uptime service.
- **Decision:** a structured JSON logger with shared redaction
  (`src/server/log.ts`, `src/lib/redact.ts`); request ids (`x-vercel-id`, or
  `x-request-id` from `src/proxy.ts`); liveness (`/api/health/live`) split from
  readiness (`/api/health`, 3 s database timeout); Sentry (`@sentry/nextjs`) for
  errors, traces, Web Vitals and the daily job's check-ins, switched on only by
  `NEXT_PUBLIC_SENTRY_DSN`. The SDK is told to collect no user data
  (`DATA_COLLECTION`: its defaults collect headers, bodies, query strings,
  user details and IPs), and every error, span, breadcrumb and trace header
  passes a scrubber (`src/lib/monitoring.ts`). Policy values in `src/config/monitoring.ts`: all
  errors, 20% of server and 10% of browser requests traced; the cron monitor's
  schedule, margin (30 min) and maximum runtime (5 min). Alerts, uptime
  monitors and SLOs are defined in [docs/OBSERVABILITY.md](../OBSERVABILITY.md).
- **Rationale:** Sentry covers errors, tracing, Web Vitals, cron and uptime
  monitoring in one free service with an official Next.js SDK.
  **Alternatives:** Vercel Observability alone (no error grouping or alerts on
  Hobby; log drains need Pro); OpenTelemetry to a self-run backend (more to
  operate); Highlight/PostHog-style session tools (record behaviour, which the
  owner ruled out without a privacy decision); logs only (no alerting).
- **Trade-offs / consequences:** no user ids are sent, so Sentry can't count
  affected users; the AI integrations are removed so prompts and answers can't
  reach traces; click and typing breadcrumbs are dropped. Session replay
  (added the same day at the owner's request, error-only, D-024's
  replay rules in [docs/OBSERVABILITY.md](../OBSERVABILITY.md)): every text and
  number masked, media blocked, no network details, and paused wherever the
  address has a query string, because the recording keeps the address and
  `/ask?q=` and `/transactions?q=` carry what people typed. Retention: Sentry's 30 days (the owner
  checked the plan on 2026-10-26), stated on `/privacy`.
  With a DSN, the landing page's first-load JS grows 4.3 KB gzipped and the SDK
  with replay (88.3 KB gzipped) loads after the page starts. Free-plan quotas cap volume;
  when they run out, events are dropped, not billed. Rules for future code:
  `log.*` instead of `console.*` on the server, `area.what_happened` event names,
  no user-written text in log fields; sampling, retention, what is sent, or
  adding replay or user ids need the owner's approval and an update here and in
  the privacy policy.
- **Affected:** `src/server/log.ts`, `src/lib/redact.ts`, `src/lib/monitoring.ts`,
  `src/config/monitoring.ts`, `src/instrumentation.ts`,
  `src/instrumentation-client.ts`, `src/sentry.server.config.ts`,
  `src/sentry.edge.config.ts`, `src/app/api/health/`, `next.config.ts`,
  `src/lib/security-headers.ts`, `/privacy`, `/admin`. **References:**
  `tests/unit/monitoring.test.ts`, `tests/unit/log.test.ts`,
  `tests/unit/observability.test.ts`, [docs/OBSERVABILITY.md](../OBSERVABILITY.md).

### D-025 Plain git hooks; branch names checked in CI

- **Status:** accepted · **Date:** 2026-10-26
- **Context:** with `main` protected (D-020), the owner asked for checks before
  commits and pushes, a branch naming convention, and merged branches cleaned up.
- **Decision:** shell hooks in `.githooks/`, which `pnpm install` turns on
  (`prepare` sets `core.hooksPath`): pre-commit refuses commits on `main` and
  runs Prettier and ESLint on staged files; pre-push checks the branch name,
  then runs `pnpm check`; post-merge reminds to install when `pnpm-lock.yaml`
  changed. Branch names are `<type>/<short-description>`
  (`scripts/check-branch-name.mjs`), and CI fails a pull request from a branch
  that doesn't follow it. Commit messages aren't checked.
- **Rationale:** hooks give fast feedback; CI is the gate, because hooks can be
  skipped. **Alternatives:** Husky (it does the same `core.hooksPath` setup,
  as a dependency); lint-staged (checks only the staged version of each file
  and can auto-fix: worth adding if partial staging or failing commits become a
  nuisance); Lefthook (a binary installed by a script, which pnpm's
  `allowBuilds` blocks). The owner chose plain hooks and a full `pnpm check`
  before each push.
- **Trade-offs / consequences:** a push waits 1–2 minutes for `pnpm check`. The
  pre-commit hook checks the working copy of each staged file, so a partly
  staged file is judged as a whole. Hooks skip themselves when `pnpm` isn't on
  the PATH (some GUI git clients).
- **Affected:** `.githooks/`, `scripts/check-branch-name.mjs`, `package.json`
  (`prepare`, `check:branch`), `.github/workflows/ci.yml`. **References:**
  `tests/unit/dev-workflow.test.ts`.

### D-026 Per-user action rate limit and Better Auth's limiter, both in Postgres

- **Status:** accepted · **Date:** 2026-10-31
- **Context:** D-018 deferred request rate limiting until there was a shared
  store. A signed-in script could call cheap actions without limit, and Better
  Auth's sign-in limits were per serverless instance (every "Sign in with
  Google" click writes a `verification` row, signed in or not).
- **Decision:** the database is the shared store. Every server action except
  four reviewed ones (`signOut`, `deleteAccount`, `sendTestError`,
  `getEntryFormData`) counts against a per-user limit per minute
  (`actionsPerMinute` in `src/config/limits.ts`), with one upsert on
  `action_rate` (`countActionCall`). `runAction(userId, fn)` checks it; other
  actions call `withinActionLimit` first. Over the limit an action returns its
  usual failure ("Too many requests…", the AI's "busy", or `false`/`null` for
  background checks) instead of throwing, and one warning is logged per user
  per minute. Better Auth uses `rateLimit.storage: "database"` (its
  `rate_limit` table) with its default limits.
- **Rationale:** no new service or dependency; one row per user, exact when
  calls arrive together. A thrown error would reach `onRequestError`, so a
  flood of calls would become a flood of Sentry events. **Alternatives:**
  Upstash Redis (a new service, two dependencies and keys); keep deferring until
  the own server (the owner chose to build it now); an in-memory limiter (per
  instance on serverless).
- **Trade-offs / consequences:** one extra small write per action call, and one
  or two queries per Better Auth request. Windows are calendar minutes, so a
  burst across a minute boundary can reach twice the limit. Requests still reach
  the server: the limit stops the work, not the invocation. A new action must
  check the limit or be added to `EXEMPT` in `tests/security/rate-limit.test.ts`.
  Better Auth needs one client address in `x-forwarded-for`
  (implementation-notes.md).
- **Affected:** `src/server/action-utils.ts`, `src/server/services/limits.ts`,
  `src/config/limits.ts`, `src/server/auth.ts`, every file in
  `src/server/actions/`, `drizzle/0008_rate_limits.sql`. **References:**
  `tests/security/rate-limit.test.ts`, `tests/security/auth.test.ts`,
  `tests/db/limits.test.ts`, `tests/integration/actions.test.ts`.

### D-027 Nonce-based CSP; every page renders per request

- **Status:** accepted · **Date:** 2026-10-31
- **Context:** D-012 allowed inline scripts to keep D-002's static shells. The
  owner chose a strict CSP instead, knowing the cost. Next's docs: with nonces
  "all pages must be dynamically rendered", and Partial Prerendering (what
  Cache Components does) is incompatible with them; its experimental SRI keeps
  pages static but doesn't cover Next's inline scripts.
- **Decision:** `src/proxy.ts` makes a fresh nonce for every page request and
  puts the policy on the request (Next reads the nonce from there and adds it to
  its own scripts) and the response. `script-src` is `'self' 'nonce-…'
'strict-dynamic'`, the theme snippet's hash, and Razorpay's host;
  `'unsafe-inline'` is gone from scripts (it stays for styles: toasts inject
  `<style>`, components use `style={}`). The root layout calls `connection()`
  and sets `instant = false`, so every page renders per request with an empty
  prerender. Route handlers get a fixed no-scripts CSP from `next.config.ts`.
- **Rationale:** an injected inline script can't run, whatever the app renders.
  **Alternatives:** keep D-012 (recommended by the agent; the owner chose this);
  experimental SRI (doesn't cover Next's inline scripts); nonces only on some
  routes (two policies to keep straight).
- **Trade-offs / consequences:** no static shell from the CDN: every page view
  is a function call (slower first paint, more Vercel usage; to be measured,
  known-issues.md), and build-time shell validation is off. Pages must keep
  working without a static shell. The global error page is still prebuilt
  without a nonce, so its "Try again" is a plain link. Browser tests on
  `pnpm dev` don't show production rendering: run `PW_PROD=1 pnpm test:e2e
security.spec.ts` after changing the CSP, the proxy or the root layout.
- **Affected:** `src/proxy.ts`, `src/lib/security-headers.ts`, `next.config.ts`,
  `src/app/layout.tsx`, `src/app/global-error.tsx`, `playwright.config.ts`.
  **References:** `tests/security/headers.test.ts`, `tests/e2e/security.spec.ts`,
  `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`.

### D-028 Category colors look different from each other, enforced by the server

- **Status:** accepted · **Date:** 2026-10-31
- **Context:** the owner wanted each new category to get a random color that's
  unique to the eye, not just a different hex code, on new and existing
  accounts. Before, "Add category" always started on green, and the 25
  defaults shared 12 swatches (some pairs nearly identical: violet and indigo
  ΔE 5.6; slate and pink ΔE 0.4 for protanopia).
- **Decision:** a category's color must be at least ΔE 10 (OKLab ×100, the
  dataviz validator's measure) from every other active category of the same
  kind; once no color is that far from all of them, it must be as distinct as
  the best still free (less 1). Colors come from a muted band (OKLCH L
  0.48–0.67, C 0.10–0.20, ≥ 3:1 on both backgrounds). `src/lib/category-colors.ts`
  computes it for the form (10 random suggestions, Shuffle) and the server
  (`createCategory`, `updateCategory`, `restoreCategory`) enforces it. Keeping a
  category's current color on edit is allowed. New accounts' defaults were
  re-picked to be distinct per kind, near their old hues; existing accounts are
  brought under the rule once by `pnpm categories:recolor` (colors only,
  nothing deleted).
- **Rationale:** ΔE 10 is clearly different side by side; per kind because
  income and spending never share a list or chart. **Alternatives:** ΔE 15,
  the chart standard (only ~9 colors per kind fit); ΔE 8 (more room, subtler);
  unique across both kinds (the 25 defaults alone don't fit); chroma capped at
  0.16 (calmer, but the 18 spending defaults didn't fit; the owner chose 0.20
  after a side-by-side preview).
- **Trade-offs / consequences:** room is small: the 18 spending defaults use
  almost all of it, so most new spending categories get "the best still free"
  (about ΔE 7–9 from their nearest), and the form may show only one or two
  suggestions. Not safe for colour blindness at this distance; identity never
  relies on color alone (icon and name). Tests that create categories take a
  color from `freeCategoryColor` (`tests/db/helpers.ts`).
- **Affected:** `src/lib/category-colors.ts`, `src/lib/default-categories.ts`,
  `src/server/services/categories.ts`, `src/components/categories/`,
  `scripts/recolor-categories.ts`. **References:** `tests/unit/category-colors.test.ts`,
  `tests/db/category-colors.test.ts`.
