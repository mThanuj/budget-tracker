import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";
import { sentryDsn } from "./lib/monitoring";

// Runs once when a server instance starts, before it serves requests.
export async function register() {
  // Error and performance monitoring, when configured (docs/OBSERVABILITY.md).
  if (sentryDsn()) {
    if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server.config");
    if (process.env.NEXT_RUNTIME === "edge") await import("./sentry.edge.config");
  }
  // Only in the production image (RUN_MIGRATIONS=1 in the Dockerfile); in
  // development, run `pnpm db:migrate` yourself.
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.RUN_MIGRATIONS !== "1") return;
  const { runMigrations } = await import("./server/db/migrate");
  await runMigrations();
}

// Next calls this for every unexpected error while handling a request (pages,
// server actions, route handlers, the proxy). It's the one place unexpected
// errors are reported, so they aren't logged again at other layers. Expected
// failures (UserError, validation) never get here: actions return them.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const { log } = await import("./server/log");
  const { requestIdFrom } = await import("./server/request-id");
  const requestId = requestIdFrom(request.headers);
  // The reference the error page shows, so a user's report can be looked up.
  const digest = err instanceof Error && "digest" in err && typeof err.digest === "string" ? err.digest : undefined;
  // Sentry gets the error itself (it scrubs the request, see src/lib/monitoring.ts);
  // the log line is for the platform's logs, so the logger doesn't report it again.
  Sentry.withScope((scope) => {
    if (requestId) scope.setTag("request_id", requestId);
    if (digest) scope.setTag("digest", digest);
    Sentry.captureRequestError(err, request, context);
  });
  log.error(
    "request.failed",
    {
      err,
      method: request.method,
      path: request.path, // the query string is removed by the logger
      route: context.routePath,
      routeType: context.routeType,
      renderSource: context.renderSource,
      requestId,
    },
    { report: false },
  );
};
