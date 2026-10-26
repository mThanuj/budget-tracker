# Known issues and technical debt

Confirmed open items as of 2026-10-26. Nothing here is a current outage. When
you fix one, delete it here and add a line to [changelog.md](changelog.md);
when you find one, add it with how it was confirmed. Approved future work is in
[roadmap.md](roadmap.md); deferred security items are kept in
[SECURITY.md](../../SECURITY.md#known-trade-offs-and-deferred-hardening) (listed
here only by name).

## Priorities

From the independent assessment on 2026-10-26. Details are in the sections
below; keep this list in step when an item is done or a new one outranks it.

- **High, needs the owner:** branch protection on `main`; a first backup
  restore; uptime monitors and the remaining monitoring checks; the Vercel
  settings to confirm (all under [Operations](#operations)).
- **Next:** browser tests in CI and the actions without direct tests (under
  [Not covered by automated tests](#not-covered-by-automated-tests)); the
  manual cross-user list (under [Security](#security-deferred-details-in-securitymd)).
- **Later:** moving the three actions' queries into services
  ([Code quality](#code-quality)); request rate limiting
  ([Security](#security-deferred-details-in-securitymd)); Dependabot PRs #3 and #4
  ([Dependencies](#dependencies)).

## Security (deferred; details in SECURITY.md)

- No request rate limiting for app actions (needs a shared store; Better Auth's
  own limiter is in-memory per instance).
- Shared free AI tier: one user can use a share of the global daily budget.
- CSP allows inline scripts (decision D-012).
- Display name and avatar URL are unvalidated (self-only).
- Cross-user checks in `tests/security/access-control.test.ts` are a listed set
  of actions (wallets, categories, goals, recurring items, budgets, entries);
  billing, setup, alerts, subscription suggestions and insights aren't in the
  list, and a new action that takes an id isn't caught automatically
  (confirmed 2026-10-26).
- `.claude/settings.json` rules are prefix matches for Claude Code only: other
  forms of a command, and other agents, aren't covered.

## Dependencies

- `pnpm audit`: 1 moderate advisory, `esbuild` through `better-auth` →
  `drizzle-kit` (esbuild's dev server, which never runs here). Accepted; revisit
  when drizzle-kit updates. Two deprecated sub-dependencies on the same path.
- `pnpm-workspace.yaml` overrides the MCP SDK and zod under `next-devtools-mcp`
  to patched versions (decision D-022); remove them when that package updates
  its own dependencies, then check `pnpm audit`.
- ESLint 9 is marked deprecated upstream (`pnpm install` warns). Moving to
  ESLint 10 depends on `eslint-config-next` supporting it; not started.
- Open Dependabot PRs: #3 TypeScript 5 → 6 (major, needs testing), #4
  `@types/node` 24 → 26 (doesn't match the Node 24 runtime; should be closed,
  with Dependabot told to skip `@types/node` majors).

## Not covered by automated tests

- Real Google sign-in and the signup seeding hook (tests use Better Auth's test
  helpers); the real Razorpay checkout popup; `checkPaymentStatus` and a
  successful `cancelPro`; AI answer quality (only `pnpm test:e2e:live` and the
  `ai:*` scripts); the admin stats page; restoring a backup.
- Browser tests aren't in CI: they need a database and an auth secret on the
  runner. Run `pnpm test:e2e` locally for UI changes. Without them CI barely
  covers the UI: Vitest line coverage on 2026-10-26 was 0% for pages and 14%
  for components (services 92%, `lib` 94%, actions 67%, API routes 100%).
- Actions with no direct test outside the browser tests: `parseEntryText`,
  `suggestCategoryFor`, `parseSetupAnswer`, `completeWelcome`; only refused
  cross-user calls or a mock for `saveCategory`, `categoryAction`, `confirmDue`,
  `checkPaymentStatus` (confirmed 2026-10-26).
- `pnpm check:bundle` compares the build with the secret values in `.env.local`
  and the environment; CI has none, so it isn't run there.

## Operations

- **Monitoring is on; parts are still unverified** (2026-10-26). Verified on
  the live site: a test error reached Sentry scrubbed, source maps uploaded,
  Sentry's default alert emailed the owner, and a browser test error's replay
  was fully masked. Still to do
  ([docs/OBSERVABILITY.md](../OBSERVABILITY.md#checking-that-it-works)): the
  daily job's cron monitor after its first run, uptime monitors on
  `/api/health/live` and `/api/health` (none yet), the replay pause on an
  address with a query string, and alerts A1–A5 if the default alert proves too quiet. Vercel
  Hobby keeps runtime logs only briefly.
- **A backup has never been restored.** The nightly encrypted backups (D-011)
  run, but nobody has tried restoring one, so they're unproven. Do it once
  with [docs/RESTORE.md](../RESTORE.md) into a throwaway Neon branch.
- The live site's security headers haven't been checked from outside (agent sandboxes
  get 403 from vercel.app): `curl -sI https://clearpaisa-seven.vercel.app | grep -i content-security`.
- Fonts (Onest, Young Serif, Spline Sans Mono via Fontsource) swap in without
  preloading, so the first visit may shift layout. Not measured: check with
  PageSpeed Insights on the live site; if CLS > 0.1, switch to `next/font/local`
  (mind the unicode-range subsets: ₹ may be outside the latin one).
- **`main` has no branch protection** (GitHub API, 2026-10-26): a push deploys
  to production whether or not CI passes. Turn it on and require the CI
  `checks` job.
- Settings only visible in the dashboards, to confirm: Vercel's Node version
  (should be 24.x like `.nvmrc`), Fluid compute on (a chat answer can take up to
  45 s), Preview deployments not using the production `DATABASE_URL`.

## Code quality

- Layering: the account, settings and billing actions query the user and
  subscription tables directly instead of through services (user-scoped, so not
  a security issue; confirmed 2026-10-26). Move new queries into services.
- `goal_contribution` has no index starting with `user_id`, though the daily
  limit counts it by user (fine at current sizes).

- `noUncheckedIndexedAccess` is off; the code often destructures query results
  (`const [row] = …`). Turning it on would flag many spots: adopt deliberately.
- No SEO metadata beyond title and description (`metadataBase`, an OG image,
  `robots.ts`, `sitemap.ts`).
