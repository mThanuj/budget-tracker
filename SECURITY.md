# Security

## Reporting a vulnerability

Please email the address on the app's Contact page (also `SUPPORT_EMAIL` in the
deployment). Don't open a public issue for a security problem. We aim to reply
within 2 working days.

## Posture

- **Auth**: Google sign-in only (no password to leak); email/password and
  change-email are disabled. Sessions are httpOnly, `SameSite=lax`, secure in
  production (Better Auth defaults). The admin area requires a Google-verified
  email in `ADMIN_EMAILS` and otherwise returns 404.
- **Access control**: every server action and route handler calls
  `requireUser()`; services take `(db, userId, …)` and re-scope every query by
  `userId`, including ownership checks on all client-supplied ids. Custom user
  fields are `input: false`, so the client can't set them.
- **Injection**: Drizzle parameterises all queries; the few `sql.raw` uses take
  only hardcoded literals; search escapes LIKE wildcards. AI output renders as
  React text nodes (no HTML), and user colours are regex-validated. CSV export
  neutralises spreadsheet formulas.
- **Payments**: Razorpay checkout and webhook signatures are verified; webhooks
  are deduplicated and reconciled against Razorpay's API rather than trusting
  the payload. See the M7 notes.
- **Transport & headers**: a Content-Security-Policy and the supporting headers
  (HSTS, nosniff, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`)
  are set on every response — see `src/lib/security-headers.ts`.
- **Secrets**: validated at startup (`src/env.ts`); only `NEXT_PUBLIC_APP_NAME`
  reaches the client; nothing logs secrets.
- **Side effects need a click**: links can't make the app act for someone. A
  `/ask?q=` link only fills in the question; it's sent straight away only when
  it came from the home page's ask box in the same tab.
- **Regression tests**: `pnpm test:security` checks these rules across the
  whole app (every action, route, page and client file), so a new one can't
  skip a control unnoticed. See docs/TESTING.md.
- **Supply chain**: pinned registry, install scripts restricted
  (`pnpm-workspace.yaml` allowBuilds), a release-age delay on new versions, and
  Dependabot for known CVEs.

## Known trade-offs and deferred hardening

- **CSP `script-src` allows inline.** Next's App Router emits per-page inline
  bootstrap scripts whose content isn't known in advance, so a hash or nonce
  would force every page to render dynamically and defeat cacheComponents/PPR.
  We keep static rendering and instead restrict where scripts load from and lock
  down `base-uri`/`object-src`/`frame-ancestors`/`form-action`. There is no
  inline-script injection sink in the app. (`'unsafe-eval'` is added in
  development only, where React Fast Refresh requires it; production is strict.) To go nonce-based later, mint a nonce
  in `src/proxy.ts` and accept dynamic document rendering.
- **Per-user rate limiting of app actions is not yet in place.** Better Auth
  rate-limits its own endpoints, and AI use is capped per user and globally per
  day, but cheap authed actions aren't rate-limited. Doing it properly on a
  serverless host needs a shared store (e.g. Upstash Redis); an in-memory
  limiter would be per-instance and unreliable. Add when abuse appears or when
  moving to the always-on server.
- **No per-user limit on how much data an account can create.** Entries,
  wallets, categories, goals, recurring items and dismissed alerts have no
  per-account cap, so one scripted account could fill the shared database's
  storage (Neon's free tier is small) and stop saves for everyone. A cap or a
  daily creation limit per account needs no shared store (it's a count in the
  same database); add it with the rate limiting above.
- **Display name and avatar URL are the user's own to set.** Better Auth's
  update-user endpoint accepts any name length and any image URL. Only that
  user sees them (the CSP blocks images from other hosts), so they're not
  validated.
- **Denial-of-wallet on the shared free AI tier.** One user can consume a share
  of the global daily free-chain budget. Bounded by the global cap; add a
  per-user burst limit (above) and backup providers to reduce the blast radius.
