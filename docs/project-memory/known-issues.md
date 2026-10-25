# Known issues and technical debt

Confirmed open items as of 2026-10-25. Nothing here is a current outage. When
you fix one, delete it here and add a line to [changelog.md](changelog.md);
when you find one, add it with how it was confirmed. Approved future work is in
[roadmap.md](roadmap.md); deferred security items are kept in
[SECURITY.md](../../SECURITY.md#known-trade-offs-and-deferred-hardening) (listed
here only by name).

## Security (deferred; details in SECURITY.md)

- No request rate limiting for app actions (needs a shared store; Better Auth's
  own limiter is in-memory per instance).
- Shared free AI tier: one user can use a share of the global daily budget.
- CSP allows inline scripts (decision D-012).
- Display name and avatar URL are unvalidated (self-only).

## Dependencies

- `pnpm audit`: 1 moderate advisory, `esbuild` through `better-auth` →
  `drizzle-kit` (esbuild's dev server, which never runs here). Accepted; revisit
  when drizzle-kit updates. Two deprecated sub-dependencies on the same path.
- Open Dependabot PRs: #3 TypeScript 5 → 6 (major, needs testing), #4
  `@types/node` 24 → 26 (doesn't match the Node 24 runtime; should be closed,
  with Dependabot told to skip `@types/node` majors).

## Not covered by automated tests

- Real Google sign-in and the signup seeding hook (tests use Better Auth's test
  helpers); the real Razorpay checkout popup; `checkPaymentStatus` and a
  successful `cancelPro`; AI answer quality (only `pnpm test:e2e:live` and the
  `ai:*` scripts); the admin stats page; restoring a backup.
- Browser tests aren't in CI: they need a database and an auth secret on the
  runner. Run `pnpm test:e2e` locally for UI changes.

## Operations

- No error monitoring service; Vercel Hobby keeps runtime logs only briefly.
- The live site's security headers haven't been checked from outside (agent sandboxes
  get 403 from vercel.app): `curl -sI https://clearpaisa-seven.vercel.app | grep -i content-security`.
- Fonts (Onest, Young Serif, Spline Sans Mono via Fontsource) swap in without
  preloading, so the first visit may shift layout. Not measured: check with
  PageSpeed Insights on the live site; if CLS > 0.1, switch to `next/font/local`
  (mind the unicode-range subsets: ₹ may be outside the latin one).
- Settings only visible in the dashboards, to confirm: Vercel's Node version
  (should be 24.x like `.nvmrc`), Fluid compute on (a chat answer can take up to
  45 s), Preview deployments not using the production `DATABASE_URL`, GitHub
  branch protection on `main` requiring CI.

## Code quality

- `noUncheckedIndexedAccess` is off; the code often destructures query results
  (`const [row] = …`). Turning it on would flag many spots: adopt deliberately.
- No SEO metadata beyond title and description (`metadataBase`, an OG image,
  `robots.ts`, `sitemap.ts`).
