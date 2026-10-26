# Observability: logs, errors, health checks and alerts

How you find out that something is wrong with the live site, and then why.
The app works the same without any of the outside services; error monitoring
(Sentry, free plan) switches on only when `NEXT_PUBLIC_SENTRY_DSN` is set.
Decision and policy: D-024 in
[design-decisions.md](project-memory/design-decisions.md#d-024-observability-structured-logs-sentry-health-checks).

## At a glance

| Question                         | Where to look                                                          | Alert (see [Alerts](#alerts))          |
| -------------------------------- | ---------------------------------------------------------------------- | -------------------------------------- |
| Is the site up?                  | uptime monitor on `/api/health/live`                                   | A4: two failed checks in a row         |
| Can it reach the database?       | uptime monitor on `/api/health`                                        | A5: two failed checks in a row         |
| Did something break for someone? | Sentry → Issues                                                        | A1 new or returning error, A2 burst    |
| Did the daily job run?           | Sentry → Crons → `recurring-entries`; Vercel → Settings → Cron Jobs    | A3: missed, failed or too slow         |
| Is it slow?                      | Sentry → Insights (Backend; Frontend for Web Vitals)                   | A7, if your Sentry plan has it         |
| Is the AI working?               | `/admin` → AI providers (outcomes per provider)                        | none: the fallback chain handles it    |
| Is the database healthy?         | Neon console → Monitoring                                              | Neon's own usage emails                |
| Did last night's backup run?     | GitHub → Actions → Nightly database backup                             | GitHub's email for a failed workflow   |
| Did a deploy fail?               | Vercel → Deployments                                                   | Vercel's email for a failed deployment |
| What happened in one request?    | Vercel → Logs, by request id; Sentry, by `request_id` or `digest` tags | (see [Logs](#logs))                    |

## How it fits together

```text
browser  error boundaries ─────────────────────────────┐
         page loads, navigations, Web Vitals (10%) ────┤
server   unexpected errors (onRequestError) ───────────┼──▶ Sentry (scrubbed first)
         handled failures: log.error(event, { err }) ──┤
         traces (20%): pages, actions, queries, calls ─┤
         daily job check-ins ──────────────────────────┘
         every log line (JSON) ─────────────────────────────▶ Vercel → Logs (or Docker's log)
uptime   /api/health/live (5 min), /api/health (hourly) ───▶ uptime monitor → email
```

| File                                                                                           | Role                                                                               |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `src/server/log.ts`                                                                            | the logger: `log.info/warn/error/debug(event, fields)`                             |
| `src/lib/redact.ts`                                                                            | redaction rules shared by logs and Sentry                                          |
| `src/config/monitoring.ts`                                                                     | sampling rates and the daily job's schedule (policy: change only with D-024)       |
| `src/lib/monitoring.ts`                                                                        | Sentry options for every runtime and the scrubber every event passes through       |
| `src/instrumentation.ts`                                                                       | starts Sentry on the server; `onRequestError` reports unexpected errors            |
| `src/sentry.server.config.ts`, `src/sentry.edge.config.ts`                                     | the server and edge SDK setup; `log.error` reports through here                    |
| `src/instrumentation-client.ts`, `src/lib/sentry-browser.ts`, `src/lib/report-client-error.ts` | the browser SDK, loaded after the page starts, only with a DSN                     |
| `src/server/request-id.ts`, `src/proxy.ts`                                                     | request ids: Vercel's `x-vercel-id`, or an `x-request-id` the proxy adds           |
| `src/app/api/health/live/route.ts`, `src/app/api/health/route.ts`                              | liveness and readiness                                                             |
| `src/app/api/cron/recurring/route.ts`                                                          | the daily job, with Sentry check-ins                                               |
| `next.config.ts`                                                                               | Sentry's build plugin, only with a DSN (source maps uploaded, then deleted)        |
| `src/lib/security-headers.ts`                                                                  | lets the browser send to Sentry's ingest host (CSP `connect-src`), only with a DSN |
| `src/server/actions/admin.ts`, `src/components/admin/test-error-button.tsx`                    | `/admin` → Send a test error                                                       |

Without a DSN (local development, tests, until you set Sentry up), no Sentry
code reaches the browser, the build plugin doesn't run and nothing is sent
anywhere. Logs and health checks work either way.

## What leaves the app, and what never does

**Sent to Sentry:** the error's type and scrubbed message, the stack trace (file,
function, line), the route pattern (`/(app)/ask`), the method, the URL without
its query string, the request id and error reference, environment and release,
browser and OS names and versions, the server's runtime and OS details, and
timings: pages, server actions, database queries (SQL with `$1` placeholders,
never the values), outgoing calls (host and path), and Web Vitals.

**Never sent:** request headers, cookies and bodies; query strings; who the user
is (no user id, email or IP address: the SDK collects no user details and
tells Sentry not to infer IPs, the scrubber removes `user`, and the Sentry
project is set not to store IPs); local variables; database query values; on-screen or typed text (click and input breadcrumbs are dropped);
AI prompts and answers (Sentry's AI integrations are removed; AI calls appear
only as HTTP timings).

**Session replay** (browser, the owner's decision of 2026-10-26, D-024): only
for a visit in which an error happens. The browser keeps about the last minute
of the page; if an error is reported, that minute is sent with the error, and
recording continues until the visit has been idle for 15 minutes or reaches an
hour (the SDK's defaults). Ordinary visits send nothing. A replay shows the
page's layout, scrolling, clicks and page changes; every piece of text and
every number is shown as asterisks, typing isn't recorded, images and video
are blocked, and labels, titles and link addresses are masked
(`REPLAY_OPTIONS`). No request or response details. Replay's own click,
navigation and network records are scrubbed (`scrubRecordingEvent`,
`scrubReplayEvent`). The recording keeps the page's address in a part nothing
can scrub, and some addresses carry what someone typed (`/ask?q=…`,
`/transactions?q=…`), so recording **pauses, dropping what it hasn't sent,
wherever the address has a query string** (`src/instrumentation-client.ts`):
errors on those pages come without a replay.

How it's enforced, in two layers (`src/lib/monitoring.ts`):

1. `DATA_COLLECTION` tells the SDK not to collect user details, cookies,
   headers, bodies, query strings, database values, AI or MCP content, or local
   variables. Sentry's own defaults collect all of these, so this option
   matters most.
2. Scrubbers remove anything that still gets through: `scrubEvent` (errors),
   `scrubSpan` (each trace span: traces are streamed span by span, so
   `beforeSendTransaction` would never run), `scrubBreadcrumb`, and
   `scrubTraceHeader` (the trace header every envelope carries). The logger's
   redaction applies on top.

The options are type-checked against the SDK's (`satisfies`), so an option the
installed SDK doesn't know, like the `sendDefaultPii` that version 11 dropped,
fails `pnpm typecheck` instead of being silently ignored.
`tests/unit/monitoring.test.ts` runs the real SDK with the app's own server
setup, every request traced, and an in-memory transport, and checks what
would be sent, including the settings the SDK actually resolved. After an SDK
upgrade, read its changelog for new data it collects. One consequence: Sentry
can't count "users affected", only events.

The privacy policy (`/privacy`) says this in plain words when monitoring is on.

## Sampling, retention and cost

- **Sampling** (`src/config/monitoring.ts`): every error; 20% of server
  requests and 10% of browser page loads and navigations are traced.
- **Sentry plan:** the free plan has monthly quotas for errors and spans, and
  keeps data for 30 days (errors, traces and replays; the owner checked the
  plan on 2026-10-26, and the privacy page says so: update it if the plan
  changes). When a quota runs out, Sentry drops
  new events until the month resets; the free plan never charges. If you ever
  upgrade, keep the pay-as-you-go budget at 0 unless you mean to spend.
  Sentry's spike protection is on by default.
- **Vercel logs:** the Hobby plan keeps runtime logs only briefly (check Vercel's
  limits page), so Sentry is the lasting record of errors.
- **Page weight** (measured 2026-10-26, `pnpm build` with a placeholder DSN):
  the landing page's first-load JavaScript grows by 4.3 KB gzipped (222.4 →
  226.7 KB); the SDK with replay (88.3 KB gzipped, of which replay is about 36)
  loads after the page has started.
- **Replays:** the free plan includes a small monthly number (check Sentry →
  Stats); with error-only sampling, each one is a visit that had an error.
  Without a DSN, nothing changes.
- **Neon:** every readiness check runs a query and so wakes the database. Check
  `/api/health` at most hourly; the frequent check is `/api/health/live`, which
  doesn't touch the database.

## Setting it up in production

These steps are the owner's: they create an account, change production settings
and deploy.

1. **Sentry account and project.** Sign up at sentry.io (free plan). Pick the
   data region (US or EU) when creating the organization; it can't be changed
   later. Create a project: platform **Next.js**, name `clearpaisa`. Skip the
   setup wizard: it would edit files the app already has.
2. **Project settings** (menu names may have moved; search the settings):
   - Security & Privacy: turn on **Prevent Storing of IP Addresses**; keep
     **Data Scrubber** and **Use Default Scrubbers** on.
   - Allowed Domains (client security): your site's domain, so the public DSN
     can't be used to send events from elsewhere.
   - Inbound Filters (optional): web crawlers, legacy browsers.
3. **Values to copy:** the DSN (Project Settings → Client Keys), the
   organization and project slugs, and an **organization auth token**
   (Settings → Auth Tokens; it can upload source maps and nothing else). Keep
   the token in your password manager; it's shown once.
4. **Vercel → Settings → Environment Variables**, Production only (like the
   rest, see [DEPLOY.md](DEPLOY.md)): `NEXT_PUBLIC_SENTRY_DSN`,
   `SENTRY_AUTH_TOKEN` (mark it Sensitive), `SENTRY_ORG`, `SENTRY_PROJECT`.
   The DSN is read at build time, so it takes effect with the next deploy.
5. **Deploy**, then go through [Checking that it works](#checking-that-it-works).
6. **Alerts and uptime monitors:** [Alerts](#alerts),
   [Uptime monitors](#uptime-monitors).

Locally, leave the DSN out of `.env.local`. To try Sentry locally, set it in
your shell for one run; events are labelled `development`.

Switching it off (rollback): remove `NEXT_PUBLIC_SENTRY_DSN` in Vercel and
redeploy. The app runs exactly as before; the uptime monitors keep working.

## Checking that it works

Don't call monitoring or alerting "working" until steps 2 to 4 have been done on
the live site. Write the date in [known-issues.md](project-memory/known-issues.md#operations).

1. `/admin` → Setup checks: "Error monitoring: Sentry on" (it warns if
   `SENTRY_AUTH_TOKEN` is missing: stack traces then point at built code).
2. `/admin` → Error monitoring → **Send a test error**. Within a minute, Sentry →
   Issues shows "Test error from the admin page (safe to ignore)", tagged
   `event: monitoring.test_error`, `handled: yes`, environment `production`.
3. Open the event and check: no IP address, no user, no cookies or headers, no
   query string in any URL; the stack trace names `src/server/actions/admin.ts`
   (source maps uploaded).
4. The email from alert A1 arrives. If not: the rule's environment filter, your
   address under User Settings → Notifications, the spam folder.
5. Resolve the issue in Sentry, so the next test raises a "returning error"
   alert instead of being grouped silently.
6. The next morning: Sentry → Crons → `recurring-entries` shows an OK check-in.
   The monitor is created by the first run; open it and set its alert (A3).
7. Browser: open the site with the developer tools open. No CSP errors in the
   console; on about one page load in ten, a request to Sentry's ingest host
   answers 200.
8. Replay: on `/admin`, wait a few seconds, then press **Send a test browser
   error**. The issue "Test browser error from the admin page (safe to ignore)"
   gets a Replay tab. Play it and check that every word and number is
   asterisks, images are grey boxes, and the URL list has no query strings.
9. After some traffic, Sentry → Insights → Backend shows page and action timings.

## Alerts

Set up in Sentry (Alerts → Create Alert) and the uptime service, not in code:
they're listed here so they can be recreated. Each one emails the owner.
Thresholds are a starting point for a small site; revisit them after a month
(and record the change in D-024).

| ID  | Name                 | Where                                      | Condition                                                                                                                      | First response                                                 |
| --- | -------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| A1  | New or returning     | Sentry issue alert                         | a new issue is created, or an issue changes from resolved to unresolved; environment `production`; at most once per 30 minutes | [Incident checklist](#incident-checklist)                      |
| A2  | Error burst          | Sentry issue alert                         | an issue is seen more than 10 times in 1 hour; environment `production`                                                        | the same; probably affects several people                      |
| A3  | Daily job            | Sentry Crons, monitor `recurring-entries`  | a run is missed (30 minutes late), fails, or takes over 5 minutes (from `src/config/monitoring.ts`)                            | Vercel → Cron Jobs, then the logs for `cron.*`                 |
| A4  | Site down            | uptime monitor on `/api/health/live`       | two failed checks in a row (checked every 5 minutes)                                                                           | Vercel status page and Deployments; roll back the last deploy  |
| A5  | Database unreachable | uptime monitor on `/api/health`            | two failed checks in a row (checked hourly)                                                                                    | Neon status page and console; `health.db_unreachable` in logs  |
| A6  | Error rate           | Sentry metric alert, if your plan has them | more than 5% of transactions failing over 15 minutes                                                                           | as A2                                                          |
| A7  | Slow                 | Sentry metric alert, if your plan has them | p95 transaction duration over 3 s for 30 minutes (excluding `/ask`, where AI answers take longer)                              | Insights → Backend: which spans (database, outside calls) grew |

Already on without setup: Vercel emails a failed deployment; GitHub emails a
failed scheduled workflow (the nightly backup) to whoever last changed it; Neon
emails about usage limits.

Not alerted, on purpose: `ai.provider_failed` (the next provider is tried; watch
`/admin`), `cron.unauthorized` and `billing.webhook_unknown_subscription`
(warnings, usually noise). Expected failures (a form error, a `UserError`) are
never logged or reported.

To test delivery after changing an alert: [Checking that it works](#checking-that-it-works),
steps 2, 4 and 5; most alert editors also have a "send test notification" button.

## Uptime monitors

Use Sentry's uptime monitoring if your plan includes it (alerts in one place),
otherwise UptimeRobot's free plan (5-minute checks, email alerts). Both only
send requests to the two public endpoints; no user data is involved.

| Monitor   | URL                              | Every     | Healthy when                     | Alert               |
| --------- | -------------------------------- | --------- | -------------------------------- | ------------------- |
| Liveness  | `https://<site>/api/health/live` | 5 minutes | 200 (a `HEAD` request works too) | 2 failures in a row |
| Readiness | `https://<site>/api/health`      | 1 hour    | 200 with `{"ok":true}`           | 2 failures in a row |

`/api/health/live` answers as soon as the app runs, without the database.
`/api/health` runs `select 1` and answers 503 `{"ok":false}` if the database
doesn't answer within 3 seconds; it never shows the error. Live up and ready
down means the database (or the network to it); both down means the app or
the platform.

## SLIs and SLOs

Starting targets over a rolling 30 days: internal goals, not promises to users.
With few users, percentages swing a lot; look at the counts too.

| Indicator (SLI)                                            | Measured by                           | Target (SLO)                         |
| ---------------------------------------------------------- | ------------------------------------- | ------------------------------------ |
| Availability: liveness checks that pass                    | uptime monitor                        | 99.5% (about 3.6 hours a month)      |
| Readiness: readiness checks that pass                      | uptime monitor                        | 99%                                  |
| Errors: server requests ending in an unexpected error      | Sentry, traced requests' failure rate | under 1%                             |
| Page speed: p95 server time for page requests              | Sentry → Insights → Backend           | under 1.5 s                          |
| Action speed: p95 for server actions, not counting AI ones | Sentry → Insights → Backend           | under 1 s                            |
| Web Vitals, p75 (LCP, INP, CLS)                            | Sentry → Insights → Frontend (10%)    | LCP < 2.5 s, INP < 200 ms, CLS < 0.1 |
| Daily job runs OK                                          | Sentry → Crons                        | 29 days out of 30                    |

When a target is missed for a month, the owner decides whether reliability work
comes before new features.

## Logs

One JSON line per event in production (`{ts, level, event, env, …fields}`), a
readable line in development. Errors go to stderr, the rest to stdout; Vercel
shows the level. `LOG_LEVEL=debug` adds debug lines. Every field passes through
`redact()` (`src/lib/redact.ts`): credentials and fields named like user-written
text (`description`, `notes`, `question`, `prompt`, `answer`, …) are replaced
with `[redacted]`; emails, URL query strings and database query parameters are
removed from text; values are capped (2,000 characters, 4 levels, 20 items).

Use `log.*`, never `console.*`, in server code. Event names are
`area.what_happened` (snake_case). Log ids, counts and durations, never what
users wrote. `log.error(event, { err })` also reports the error to Sentry,
marked handled; pass `{ report: false }` when it's reported elsewhere.

| Event                                                                                                    | Level | To Sentry          | Means                                                                         |
| -------------------------------------------------------------------------------------------------------- | ----- | ------------------ | ----------------------------------------------------------------------------- |
| `request.failed`                                                                                         | error | yes (by Next hook) | an unexpected error in a page, action or route; the person saw the error page |
| `health.db_unreachable`                                                                                  | error | yes                | the readiness check got no answer from the database (with `ms`)               |
| `billing.checkout_start_failed`, `checkout_confirm_fetch_failed`, `status_check_failed`, `cancel_failed` | error | yes                | a Razorpay call failed; the person saw a plain "try again" message            |
| `billing.webhook_fetch_failed`                                                                           | error | yes                | a webhook couldn't fetch the subscription; Razorpay retries it (502)          |
| `billing.webhook_unknown_subscription`                                                                   | warn  | no                 | a webhook for a subscription the app doesn't know (usually a test event)      |
| `account.cancel_before_delete_failed`                                                                    | error | yes                | an account wasn't deleted because cancelling its Pro renewal failed           |
| `ai.provider_failed`                                                                                     | warn  | no                 | one AI model failed (`kind`: rate limit, timeout…); the next one was tried    |
| `ai.usage_record_failed`                                                                                 | error | yes                | an AI usage counter wasn't saved, so quotas may undercount                    |
| `config.ai_setting_invalid`, `config.cron_secret_too_short`                                              | error | yes                | a setting is malformed; that provider, or the daily job, is off until fixed   |
| `cron.unauthorized`                                                                                      | warn  | no                 | the job's URL was called without the right secret                             |
| `cron.recurring_done`                                                                                    | info  | no                 | the daily job finished (`users`, `recorded`, `ms`)                            |
| `db.migrations_done`                                                                                     | info  | no                 | own server only: migrations applied at start (`ms`)                           |
| `monitoring.test_error`                                                                                  | error | yes                | the test error from `/admin`                                                  |

Next.js itself also prints an unstructured line for unexpected errors; the
`request.failed` line is the one to search for.

**Following one request.** On Vercel every request has an id (`x-vercel-id`,
like `sin1::abc12-…`); elsewhere `src/proxy.ts` adds an `x-request-id` to page
requests (API routes get none there). Log lines carry it as `requestId`. In
Vercel → Logs, search for the id. In Sentry, unexpected errors are tagged
`request_id` and `digest`: the digest is the reference the error page shows, so
when someone sends you "reference 4085121356", search Sentry for
`digest:4085121356`. Handled failures carry `requestId` under Additional Data.

## App problem or dependency problem?

- **Database (Neon):** readiness failing while liveness passes;
  `health.db_unreachable`; errors mentioning `Failed query`, `ECONNREFUSED`,
  `Connection terminated`, `timeout exceeded when trying to connect`, or
  `Query read timeout`. Queries give up after 20 s and connections after 10 s
  (`src/server/db/index.ts`). Check Neon's status page and console.
- **Razorpay:** `billing.*` events; calls give up after 15 s
  (`src/server/billing/razorpay.ts`). Webhooks are retried by Razorpay.
- **AI providers:** `ai.provider_failed` warnings and `/admin` → AI providers.
  Each call has its own time limit and the chain tries the next provider, so
  one provider's outage shows up as slower answers, not errors. The worst case
  for one chat answer is long (see Limitations).
- **Google sign-in / Better Auth:** errors under `/api/auth/*`.
- **Vercel:** both health checks failing at once, with nothing in Sentry; check
  Vercel's status page.
- **The app:** a new Sentry issue right after a deploy, in our code
  (stack frames in `src/`). Roll back in Vercel → Deployments (Instant Rollback), then fix.

In a trace (Sentry → Insights → Backend → a slow transaction), database
queries and outgoing calls are separate spans with their own durations.

## Incident checklist

1. **Acknowledge.** Note the time and the alert. Is it still happening (Sentry
   event count, uptime monitor, open the site yourself)?
2. **Size it.** Which pages or actions; how many events since when; one person
   or many (events per hour, A2)?
3. **Find the side.** Use [App problem or dependency problem?](#app-problem-or-dependency-problem):
   check Vercel, Neon and Razorpay status pages, and the health checks.
4. **Stop the damage.** A bad deploy: Vercel → Deployments → Instant Rollback (on
   Hobby, to the previous production deployment). A dependency outage: nothing to roll back; the app shows
   plain errors and recovers by itself; consider a note to users if it's long.
   Data damage: stop and follow [RESTORE.md](RESTORE.md) only after deciding
   it's needed.
5. **Fix** with a test that fails first (`.claude/skills/fix-bug/SKILL.md`),
   deploy, and watch the issue stay quiet for a day before resolving it.
6. **Write it down** if it took more than a few minutes: what happened, how it
   was found, what changed, in [changelog.md](project-memory/changelog.md), and
   a new alert or test if this one was found late.

Never paste user data, tokens or full request logs into an issue, chat or
commit while doing this.

## Limitations

- **AI answers can be slow before they fail:** each call has its own time limit
  and isn't retried (chat: 45 s, `src/server/ai/chat.ts`), but the chain then
  tries the next provider, so with three slow providers one answer can take
  over two minutes before it fails. One slow request isn't an incident on its own.
- **Short log history on Vercel Hobby**; log drains need a paid plan. Sentry
  keeps errors; routine `info` lines are gone after a while.
- **No user counts** in Sentry, by design (no user ids are sent).
- **Sampling:** with 10–20% of requests traced and little traffic, timing
  percentiles are rough for the first weeks.
- **Edge runtime:** nothing runs there today (in Next 16 the proxy runs on
  Node.js); `src/sentry.edge.config.ts` is for any future edge route, and has
  no logger reporting.
- **On an own server** the daily job runs hourly and the cron monitor's
  schedule follows (`src/config/monitoring.ts`), but the proxy adds
  `x-request-id` to page requests only, so API routes there have no request id,
  and source maps aren't uploaded from the Docker build (stack traces point at
  built code).
- **Verified on the live site** (2026-10-26): a handled test error reached
  Sentry with no IP address, user, cookies or headers; its stack trace named
  the source file (source maps uploaded); Sentry's default high-priority alert
  emailed the owner; a browser test error came with a replay in which every
  word, number and image was masked. A1 hasn't been created separately; the
  default alert covers new issues for now.
- **Verified locally** (2026-10-26): what the server SDK would send for
  an unexpected error, a handled failure and trace spans, and the data
  collection settings it resolved (`tests/unit/monitoring.test.ts`; the browser
  SDK shares the options and scrubbers but isn't run in a test); no
  Sentry code in the browser without a DSN, and the bundle sizes above; no source
  maps in the browser files with a DSN; `pnpm check:bundle` clean; the replay
  options, scrubbers and pause rule (unit tests). **Not yet verified:** the cron
  monitor, the uptime monitors (not set up), the replay pause on addresses with
  a query string (on the live site), unexpected-error reporting from a real
  failure. See
  [Checking that it works](#checking-that-it-works).

## Rules for changing monitoring (people and agents)

- Don't remove or weaken monitoring, the scrubber, the redaction rules, the
  health checks or their tests without the owner's approval. If something
  breaks a check, fix the cause.
- Sampling rates, retention, the cron monitor's settings and the list of what
  is sent are policy (`src/config/monitoring.ts`, this file, D-024): change them
  only with the owner's approval, and update D-024 and the privacy page.
- Session replay stays error-only and fully masked, pauses on addresses with a
  query string, and records no network details. Sampling ordinary sessions,
  unmasking anything, or recording requests needs the owner's approval, an
  update to D-024 and to the privacy policy. No user feedback widgets, user
  ids or analytics without the same.
- New server code logs with `log.*` and an `area.what_happened` event; add new
  events to the table above. Unexpected errors aren't caught to be logged:
  let them reach `onRequestError`.
- Never put the auth token in a `NEXT_PUBLIC_` variable or in client code; it's
  needed only at build time.
