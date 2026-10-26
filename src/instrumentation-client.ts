// Browser error and performance monitoring. Next runs this before the app
// starts. The Sentry SDK is fetched only when NEXT_PUBLIC_SENTRY_DSN was set at
// build time; otherwise this file is empty after the build and adds nothing to
// the page. Policy: src/config/monitoring.ts; scrubbing: src/lib/monitoring.ts.
import { baseOptions, scrubTraceHeader } from "./lib/monitoring";

type SentrySdk = typeof import("./lib/sentry-browser");
let sentry: SentrySdk | undefined;

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  void import("./lib/sentry-browser").then((sdk) => {
    scrubTraceHeader(sdk.init(baseOptions("browser")));
    sentry = sdk;
  });
}

/** Lets Sentry time client-side navigations (a no-op until it has loaded). */
export function onRouterTransitionStart(...args: Parameters<SentrySdk["captureRouterTransitionStart"]>) {
  sentry?.captureRouterTransitionStart(...args);
}
