// Structured logging for server code. One JSON line per event in production
// (Vercel and Docker collect stdout/stderr as is); a readable single line in
// development and tests. Every field goes through redact() first.
//
//   log.error("billing.checkout_failed", { err, requestId });
//   log.info("cron.recurring_done", { users, recorded });
//
// Events are "area.what_happened". Log failures and important operations,
// not routine success. Expected errors (UserError, validation) aren't logged:
// the user sees them. See docs/OBSERVABILITY.md.
//
// No "server-only" import, on purpose: the AI eval scripts load modules that
// log, in plain Node, where it throws. It holds no secrets, and client code
// can't import src/server/ anyway (tests/security/static.test.ts).

import { redact } from "../lib/redact";

export { redact, scrubText } from "../lib/redact";
export type LogLevel = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

type ErrorReporter = (err: unknown, event: string, fields: Fields) => void;

declare global {
  // Kept on globalThis, not in this module: Next bundles src/instrumentation.ts
  // (which registers the reporter) apart from the pages and actions, and each
  // bundle has its own copy of this module.
  var logErrorReporter: ErrorReporter | undefined;
}

/**
 * Error monitoring registers here when it starts (src/sentry.server.config.ts),
 * so `log.error(event, { err })` also reports the error, once, while the logger
 * itself depends on nothing.
 */
export function setErrorReporter(fn: ErrorReporter | undefined) {
  globalThis.logErrorReporter = fn;
}

const pretty = process.env.NODE_ENV !== "production";

function write(level: LogLevel, event: string, fields: Fields = {}) {
  const safe = redact(fields) as Fields;
  const sink =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : level === "debug"
          ? console.debug
          : console.log;
  if (pretty) {
    const rest = Object.keys(safe).length ? ` ${JSON.stringify(safe)}` : "";
    sink(`[${level}] ${event}${rest}`);
    return;
  }
  sink(
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      event,
      env: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      ...safe,
    }),
  );
}

export const log = {
  debug: (event: string, fields?: Fields) => {
    if (process.env.LOG_LEVEL === "debug") write("debug", event, fields);
  },
  info: (event: string, fields?: Fields) => write("info", event, fields),
  warn: (event: string, fields?: Fields) => write("warn", event, fields),
  /** Also reported to error monitoring when `fields.err` is set, unless `report: false` (it's reported elsewhere). */
  error: (event: string, fields?: Fields, { report = true }: { report?: boolean } = {}) => {
    write("error", event, fields);
    const reporter = globalThis.logErrorReporter;
    if (report && reporter && fields?.err !== undefined) reporter(fields.err, event, redact(fields) as Fields);
  },
};
