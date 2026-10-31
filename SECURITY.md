# Security

## Reporting a vulnerability

Please email the address on the app's Contact page (also `SUPPORT_EMAIL` in the
deployment). Don't open a public issue for a security problem. We aim to reply
within 2 working days.

## Posture

- **Auth**: Google sign-in only (no password to leak); email/password,
  change-email and update-user are disabled, so the name and avatar are the ones
  Google gave at sign-up. Sessions are httpOnly and `SameSite=lax`, and secure
  when the site is served over https (Better Auth defaults). The admin area requires a Google-verified
  email in `ADMIN_EMAILS` and otherwise returns 404.
- **Access control**: every page and server action calls `requireUser()`.
  Route handlers check a session (`getSession()`, else 401), the cron secret or
  Razorpay's signature; only `/api/health` is public. Services take
  `(db, userId, …)`, check that client-supplied ids belong to the user
  (`getOwned*`) and filter their reads and writes by `userId`. Custom user
  fields are `input: false`, so the client can't set them.
- **Injection**: Drizzle parameterises all queries; the few `sql.raw` uses take
  only hardcoded literals; search escapes LIKE wildcards. AI output renders as
  React text nodes (no HTML), and user colours are regex-validated. CSV export
  neutralises spreadsheet formulas.
- **Payments**: Razorpay checkout and webhook signatures are verified; webhooks
  are deduplicated and reconciled against Razorpay's API rather than trusting
  the payload. See decision D-008 in docs/project-memory/design-decisions.md.
- **Transport & headers**: a strict Content-Security-Policy: a script runs
  only with the response's nonce (fresh for every page, from `src/proxy.ts`),
  as the theme snippet (by hash), or added by one that does; no inline scripts
  otherwise, and route handlers allow no scripts at all (decision D-027). What
  the proxy never sees (files, and the 404 page for an address with a dot) gets
  a fixed policy that runs no scripts but the theme snippet; every response has
  exactly one CSP (D-029). The
  supporting headers (HSTS, nosniff, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`) are on every response. See `src/lib/security-headers.ts`.
- **Secrets**: the core settings are validated on first use (`src/env.ts`);
  optional ones (AI, payments, admin) switch their feature off when missing.
  Only `NEXT_PUBLIC_APP_NAME` and the public Sentry DSN reach the client. Logs
  and error reports are redacted (credentials, user-written text, emails,
  query strings, query parameters) and carry no user identity; see
  docs/OBSERVABILITY.md.
- **Side effects need a click**: links can't make the app act for someone. A
  `/ask?q=` link only fills in the question; it's sent straight away only when
  it came from the home page's ask box in the same tab.
- **Per-account limits**: one account can only create so much (wallets,
  categories, goals and recurring items in total; entries, goal savings and
  dismissed alerts or subscription suggestions per 24 hours), so a scripted account can't fill the shared
  database and stop saves for everyone. The numbers are far above normal use
  and live in `src/config/limits.ts`; the check is a count in the same
  database, so it needs no shared store. Two simultaneous requests can
  overshoot a limit by a little, which doesn't matter for its purpose.
- **Rate limits**: every server action (except signing out, deleting the
  account, the admin test error and loading the entry form) counts against a
  per-user limit per minute (`src/config/limits.ts`), counted in the database so
  every server instance shares it; over it, nothing runs. Better Auth limits its
  own endpoints per address (sign-in: 3 per 10 seconds), also counted in the
  database. See decision D-026.
- **Regression tests**: `pnpm test:security` checks some rules across the whole
  app automatically: every action needs a session, every route is on a reviewed
  list, every signed-in page checks the session, client files import no server
  code, every action is on a reviewed list saying why it can't reach
  another user's records, and every action counts against the rate limit or is
  on a reviewed exempt list (a new one fails until it's added). Every action that
  takes ids or keys from the client is tried with another user's. See
  docs/TESTING.md.
- **Supply chain**: pinned registry, install scripts restricted
  (`pnpm-workspace.yaml` allowBuilds), a release-age delay on new versions (pnpm 11's
  default `minimumReleaseAge`), Dependabot for known CVEs, and CI failing on
  high or critical advisories (`pnpm audit --audit-level=high`).

## Known trade-offs and deferred hardening

- **Denial-of-wallet on the shared free AI tier.** One user can consume a share
  of the global daily free-chain budget. Bounded by the per-user daily caps, the
  global cap and the per-minute action limit (above). Many accounts together
  could still use it up; backup provider keys would reduce the blast radius
  (configuration only, docs/project-memory/roadmap.md).
