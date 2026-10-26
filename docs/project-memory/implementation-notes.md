# Implementation notes

Non-obvious details, workarounds and lessons learned: the things that cost
time to find. Short entries; the code comment at the referenced spot usually
has more. Add new ones under the right heading.

## Next.js 16

- APIs differ from older versions and from most training data. Check the
  docs for the installed version in `node_modules/next/dist/docs/` before using
  an API. `next dev` keeps a block saying so at the top of `AGENTS.md`.
- The proxy is `src/proxy.ts` (Next 16's name for middleware). It only checks
  that a session cookie exists.
- With Cache Components, a `GET` route handler is prerendered at build time
  unless it touches request data or I/O. `/api/health` calls `connection()`
  first so it always runs per request and the build doesn't query the database.
  `connection()` throws outside a request, so route tests mock it.
- Error boundaries get `{ error, retry }` (not `reset`). `refresh()` from
  `next/cache` re-renders after a mutation. A `redirect()` inside a server
  action becomes a client navigation; `callAction` re-throws it with
  `unstable_rethrow`.
- `next-env.d.ts` and the route types (`PageProps`, `LayoutProps`) are
  generated and gitignored, so `pnpm typecheck` runs `next typegen` before `tsc`.
- Next's dev badge sits bottom-right and can cover buttons on phone-sized
  screens; the e2e fixture hides it (`tests/e2e/support/fixtures.ts`).
- Restart `pnpm dev` after `pnpm install` changes dependencies. A dev server left
  running across the React 19.3.1 upgrade served blank pages, with "Could not
  validate `instant`" errors in the browser console, and made the first desktop
  browser tests fail; after a restart all passed (2026-10-26). Those validation
  messages themselves are dev-only (instant-navigation checks flag any route that
  reads the session) and don't affect production builds.

## React 19

- `<form action={fn}>` resets uncontrolled fields after every submit, even on a
  validation error. Use `useFormAction` (decision D-014).
- `react-hooks/set-state-in-effect` (ESLint) flags `setState` in effects. Derive
  initial state in the `useState` initializer instead (see `chat-panel.tsx`), and
  use `useEffectEvent` for effect callbacks that read the latest props.
- Mocked `useRouter` in component tests must return a stable object, or effects
  that depend on it re-run (`tests/component/activating.test.tsx`).

## Better Auth

- It turns its origin and callback-URL checks off when `NODE_ENV=test` or `TEST`
  is set. `tests/security/auth.test.ts` switches to production behaviour before
  loading it; without that, CSRF tests pass for the wrong reason.
- Its `update-user` endpoint lets users set any display name and image URL
  (self-only, accepted: SECURITY.md). App fields are `input: false`.
- Its built-in rate limiter uses memory, so on Vercel it's per instance.
- A session cookie is `<token>.<base64 HMAC-SHA256 of the token>`, URL-encoded;
  tests build one this way.

## Database

- The app uses the pooled Neon URL; migrations need the direct one
  (`DATABASE_URL_UNPOOLED`, see `drizzle.config.ts`). Client-side timeouts on the
  pool make a dropped connection fail fast (`src/server/db/index.ts`).
- `drizzle.config.ts` and the browser-test fixtures load `.env.local` with
  `process.loadEnvFile`, which doesn't override variables already set in the
  shell: an exported `DATABASE_URL` wins over the file.
- Tests create a fresh PGlite database per file with the real migrations:
  `createTestDb()` in `tests/db/helpers.ts`. Its `db` has the same type (`Db`) as
  the app's, so services run unchanged.
- `drizzle-kit generate` needs no database connection, which is how `pnpm db:check`
  works offline and in CI. It also exits 0 when it fails (e.g. it mishandles an
  absolute `out` path), so `scripts/check-migrations.mjs` judges by its message.

## AI providers

- Groq's free tier limits tokens per minute per model (8K) before anything else;
  keep prompts lean.
- Groq's strict structured output rejects an enum with one value; lists with
  fewer than 2 options are sent as plain strings (`src/server/ai/setup.ts`,
  `parse-entry.ts`).
- Groq rejects the `reasoning_content` the SDK echoes back after tool calls; it's
  stripped in `src/server/ai/providers.ts`.
- The small chat model answers without looking anything up unless the first
  step forces a tool call; if a provider rejects that, the chat retries without
  it (`src/server/ai/chat.ts`).
- After changing a model or prompt, run `pnpm ai:eval`, `ai:chat-eval` or
  `ai:insights-eval` (they call the real providers with the keys in `.env.local`).

## Razorpay

- A subscription scheduled to cancel at the end of the cycle still reads
  "active" in Razorpay's API, so the app stores `cancelAtCycleEnd` itself.
- Webhooks can't reach localhost; in development the app confirms checkout by
  asking Razorpay directly (`confirmCheckout`, `checkPaymentStatus`).

## Observability (Sentry, logs)

- **Sentry 11 collects everything by default.** `sendDefaultPii` no longer
  exists (nothing reads it); what's collected is `dataCollection`, whose
  defaults include user details and IPs, headers, cookies, request bodies,
  query strings and database values. Traces are streamed span by span
  (`traceLifecycle: "stream"`), so `beforeSendTransaction` never runs; scrub
  in `beforeSendSpan`. The trace header (dynamic sampling context) copies the
  root span's name, outside both. Found by review on 2026-10-26, before
  monitoring was ever switched on; `baseOptions` now `satisfies` the SDK's
  option type so a dropped option fails the type check.
- `withSentryConfig` is imported from `@sentry/nextjs/config`, not the package
  root. `next.config.ts` applies it only when a DSN is set at build time.
- A dynamic `import("@sentry/nextjs")` in the browser pulls in the whole SDK
  (replay and feedback included: 139 KB gzipped); importing through the named
  re-exports in `src/lib/sentry-browser.ts` cut it to 52.6 KB (2026-10-26).
- Next passes `onRequestError` the raw path with its query string and all
  request headers (cookies included), and Drizzle puts query parameter values
  in its error messages (`params: …`). Sentry's Next.js context also carries the
  raw `request_path`. `scrubEvent` handles all three; keep it that way.
- Next sets the error's `digest` (the reference on the error page) before
  `onRequestError` runs, so it can be tagged.
- Turbopack builds don't wrap handlers, so a handled `captureException` isn't
  flushed before a serverless function freezes: the reporter schedules
  `Sentry.flush` with `after()`, and the cron route awaits it.
  `captureRequestError` flushes by itself.
- Sentry's default server integrations include AI ones (Vercel AI, OpenAI,
  Anthropic, Google GenAI, Groq…) that can record prompts; `withoutAiIntegrations`
  removes them by name. Check the list after an SDK upgrade (the test does).
- **Module state isn't shared between `src/instrumentation.ts` and the app.**
  Next bundles them separately (the 2026-10-26 build had 12 copies of
  `src/server/log.ts`), so a module variable set at startup is invisible to
  pages and actions. The logger's error reporter lives on `globalThis` for this
  reason; it was a module variable at first, and the first production test
  error never reached Sentry. Sentry's own state is global, so `onRequestError`
  and cron check-ins were unaffected. Tests load one copy, so
  `tests/unit/log.test.ts` imports the logger twice to cover it.
- `src/server/log.ts` and `src/server/request-id.ts` don't import `server-only`:
  the eval scripts and `onRequestError` load them outside React's server
  environment, where it throws.
- In a Vitest mock of `@sentry/nextjs`, spreading the module loses most exports
  (they're on its prototype through CommonJS interop); inherit with
  `Object.create(sdk)`. Its ContextLines integration copies nearby source lines
  into stack frames, so a test that spells out fake secrets must turn it off.
- Runtime checks of a production build (`next start`, a real Sentry project)
  can't run in the agent sandbox (binding ports fails with `EPERM`): delivery,
  alerts and the cron monitor are checked on the live site
  ([docs/OBSERVABILITY.md](../OBSERVABILITY.md#checking-that-it-works)).

## Tests and tooling

- `tests/stubs/clean-env.ts` removes app settings before Vitest runs, so no
  test can use a real key, and sets `BILLING_ENABLED="true"` so Pro paths run.
- `import.meta.glob` is fixed when a test file is transformed and Vitest caches
  that, so the security sweeps list actions and routes from disk instead.
- `Response.text()` drops a leading byte-order mark; read `arrayBuffer()` to test
  the CSV export's BOM.
- Every test run writes `test-<suite>.log` (reporters in `tests/support/` and
  `tests/e2e/support/`). Read those to check results; don't pipe test commands
  through `tee` or `head` (the tools then lose their live output, and a closed
  pipe can kill Playwright).
- Browser tests need `.env.local` and write to its database (a development one).
  They sign in with Better Auth's test helpers, so no Google account is used.

## Sandboxed agent sessions

Seen in the owner's Claude Code setup; other environments may differ.

- `next analyze --output` (used by the `next-bundle-optimizer` skill) works
  inside the sandbox with `NEXT_WORKER_THREADS=1`, despite the skill's note
  about sandboxes that block ports (it doesn't serve anything with `--output`).
- `next-devtools-mcp` starts fine over stdio with `pnpm exec` (checked by
  sending `initialize` and `tools/list`), but reaching the owner's dev server on
  `localhost:3000` may be blocked here.
- Binding local ports and reaching `localhost` or `*.vercel.app` may be blocked:
  the owner runs `pnpm dev` and `pnpm test:e2e` and the agent reads `test-e2e.log`.
- Builds: if plain `pnpm build` fails because Turbopack's workers can't open
  local sockets, use `NEXT_WORKER_THREADS=1 pnpm build` (plain worked in a
  2026-10-26 session, so it varies). Node scripts that use the network: `NODE_USE_ENV_PROXY=1`.
- Run TypeScript scripts with `node --import tsx` (the package scripts do); the
  `tsx` CLI needs an IPC pipe some sandboxes block.
