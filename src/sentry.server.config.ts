// Sentry for the Node.js server. Loaded by register() in src/instrumentation.ts,
// only when NEXT_PUBLIC_SENTRY_DSN is set. Policy: src/config/monitoring.ts;
// scrubbing: src/lib/monitoring.ts; docs: docs/OBSERVABILITY.md.
import * as Sentry from "@sentry/nextjs";
import { after } from "next/server";
import { baseOptions, scrubTraceHeader, withoutAiIntegrations } from "./lib/monitoring";
import { setErrorReporter } from "./server/log";

scrubTraceHeader(
  Sentry.init({
    ...baseOptions("server"),
    includeLocalVariables: false, // local variables can hold user data
    integrations: (defaults) => withoutAiIntegrations(defaults),
  }),
);

// Failures the app handles but that shouldn't happen (Razorpay down, a usage
// counter not saved) are logged with log.error(event, { err }); report those
// too, marked as handled. Unhandled errors come through onRequestError.
setErrorReporter((err, event, fields) => {
  const context = { ...fields };
  delete context.err; // the error itself is the event
  Sentry.captureException(err, { level: "error", tags: { event, handled: "yes" }, extra: context });
  // A serverless function can be frozen once its response is sent; send the
  // event first. (Unhandled errors get this from captureRequestError itself.)
  try {
    after(() => Sentry.flush(2_000));
  } catch {
    // Outside a request (startup, a script) there's nothing to wait for: the
    // SDK sends the event in the background.
  }
});
