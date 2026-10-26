// Error and performance monitoring policy (Sentry). Changing these numbers
// changes cost and how much data leaves the app: record why in
// docs/project-memory/design-decisions.md (D-024) and get the owner's OK.

export const MONITORING = {
  /** Unexpected errors: all of them (Sentry's rate limits and quota cap the volume). */
  errorSampleRate: 1,
  /** Share of server requests traced (timings of pages, actions, database and outside calls). */
  serverTracesSampleRate: 0.2,
  /** Share of page loads and navigations traced in the browser (includes Web Vitals). */
  clientTracesSampleRate: 0.1,
  /** The recurring-entries job, checked in to Sentry so a missed or failed run raises an alert. */
  recurringJob: {
    slug: "recurring-entries",
    /** When it runs (UTC): vercel.json's cron on Vercel, the hourly task on an own server (docs/DEPLOY.md). */
    schedule: { vercel: "30 0 * * *", ownServer: "0 * * * *" },
    /** Minutes late before the run counts as missed, and minutes it may take. */
    checkinMarginMinutes: 30,
    maxRuntimeMinutes: 5,
  },
} as const;
