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

- **High, needs the owner:** a first backup restore; the daily job's cron
  monitor (both under [Operations](#operations)).
- **Next:** compare Vercel's usage since every page renders per request
  (PageSpeed is done; under [Operations](#operations)).

## Security (deferred; details in SECURITY.md)

- Shared free AI tier: many accounts together could use up the global daily
  budget (one is held back by its daily caps and the per-minute limit). Next
  step: backup provider keys, the owner's configuration ([roadmap.md](roadmap.md)).
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
- TypeScript 7 (the native compiler) is out; Dependabot will propose it.
  Check that `eslint-config-next`'s TypeScript ESLint supports it first.

## Not covered by automated tests

- Real Google sign-in and the signup seeding hook (tests use Better Auth's test
  helpers); the real Razorpay checkout popup; `checkPaymentStatus` and a
  successful `cancelPro`; AI answer quality (only `pnpm test:e2e:live` and the
  `ai:*` scripts); the admin stats page; restoring a backup by hand (the
  nightly workflow restores each one, D-033).
- Pages have no unit tests (Vitest line coverage on 2026-10-26: 0% for pages,
  14% for components); they're covered by the browser tests, which run in CI
  since D-032 (`e2e` job), not counting billing and AI, which skip there.
- The AI actions' success paths have no direct test without a provider (only
  `pnpm test:e2e:live`); their refusals and the learned-category path do.
- `pnpm check:bundle` compares the build with the secret values in `.env.local`
  and the environment; CI has none, so it isn't run there.

## Operations

- **Backups: restore check and environment verified** (2026-11-01). The GitHub
  environment `production-backup` exists, limited to `main`; the first backup
  run from `main` with it (run 41287862637) dumped, uploaded and passed the
  restore check on real production data, and the weekly audit ran green. The
  repository-level copies of the secrets are deleted, and a run after that
  (41291403964) read them from the environment. The owner chose not to set up
  the Sentry monitor `nightly-backup` (its check-in steps are skipped); a failed
  run still emails the owner, but a night that never runs goes unnoticed.
- **Monitoring is on; parts are still unverified** (2026-10-26). Verified on
  the live site: a test error reached Sentry scrubbed, source maps uploaded,
  Sentry's default alert emailed the owner, a browser test error's replay was
  fully masked, and UptimeRobot watches `/api/health/live` (5 min) and
  `/api/health` (hourly), its test alert received. Still to do
  ([docs/OBSERVABILITY.md](../OBSERVABILITY.md#checking-that-it-works)): the
  daily job's cron monitor after its first run, the replay pause on an
  address with a query string, and alerts A1–A3 if the default alert proves
  too quiet. Vercel
  Hobby keeps runtime logs only briefly.
- **No restore by hand yet.** Since D-033 every nightly backup is restored
  into a throwaway database on GitHub's runner, but nobody has followed
  [docs/RESTORE.md](../RESTORE.md) end to end. Do it once into a throwaway Neon
  branch: it tests the owner's own steps and tools.
- **Every page renders per request (D-027): Vercel usage not compared yet.**
  PageSpeed on the live site (2026-11-01, one run each) is well within the
  targets (LCP < 2.5 s, CLS < 0.1). Before → after D-036's fonts: `/` mobile
  score 96 → 99, LCP 2.05 s → 0.93 s, CLS 0.019 → 0.019 (the animated demo, not
  fonts), 4 font files (122 KB) → 3 (100 KB); `/` desktop 100 → 99 (LCP 0.2 →
  0.3 s, a cold start right after the deploy); `/privacy` mobile 99 → 100 (LCP
  0.9 s, CLS 0.005 → 0), desktop 100 → 100. `/privacy` now also loads the
  monospace font (+37 KB, all three are preloaded everywhere). Still to do:
  Vercel → Usage, function invocations and duration for 1–7 November against
  25–31 October; Sentry's field Web Vitals once there are enough samples.
- **Production's database password reached preview builds** until 2026-11-02
  (Vercel had every variable on Production and Preview), including Dependabot
  PR #23's build. The other secrets were replaced that day; the database
  password, rotated on 2026-11-01, wasn't yet. Rotate it once more
  ([ROTATION.md](../ROTATION.md#database-password)). Staging (D-037) is set up
  and verified: its build migrated its own database, and a sign-in landed there.

## Code quality

- `noUncheckedIndexedAccess` is off; the code often destructures query results
  (`const [row] = …`). Turning it on would flag many spots: adopt deliberately.
