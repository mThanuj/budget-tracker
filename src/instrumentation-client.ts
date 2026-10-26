// Browser error and performance monitoring. Next runs this before the app
// starts. The Sentry SDK is fetched only when NEXT_PUBLIC_SENTRY_DSN was set at
// build time; otherwise this file is empty after the build and adds nothing to
// the page. Policy: src/config/monitoring.ts; scrubbing: src/lib/monitoring.ts.
import { browserOptions, replayAllowedAt, scrubReplayEvent, scrubTraceHeader } from "./lib/monitoring";

type SentrySdk = typeof import("./lib/sentry-browser");
let sentry: SentrySdk | undefined;

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  void import("./lib/sentry-browser").then((sdk) => {
    const client = sdk.init(browserOptions(sdk.replayIntegration));
    scrubTraceHeader(client);
    sdk.addEventProcessor(scrubReplayEvent);
    pauseReplayOnPrivateAddresses(sdk, client);
    sentry = sdk;
  });
}

/**
 * Replay stops, dropping what it hasn't sent, while the address has a query
 * string (see replayAllowedAt), and starts again once it hasn't. Replay starts
 * inside init(), so the first check runs before anything can be sent.
 */
function pauseReplayOnPrivateAddresses(sdk: SentrySdk, client: ReturnType<SentrySdk["init"]>) {
  const follow = () => {
    const replay = sdk.getReplay();
    if (!replay) return;
    if (!replayAllowedAt(window.location.search)) void replay.stop({ flush: false });
    else if (!replay.getReplayId()) replay.startBuffering();
  };
  follow();
  // Navigation breadcrumbs are added just before the address changes
  // (pushState) or just after (back and forward): stop before a private one,
  // then check again once the address has changed.
  client?.on("beforeAddBreadcrumb", (breadcrumb) => {
    if (breadcrumb.category !== "navigation") return;
    const to = breadcrumb.data?.to;
    if (typeof to === "string" && !replayAllowedAt(new URL(to, window.location.href).search))
      void sdk.getReplay()?.stop({ flush: false });
    setTimeout(follow, 0);
  });
}

/** Lets Sentry time client-side navigations (a no-op until it has loaded). */
export function onRouterTransitionStart(...args: Parameters<SentrySdk["captureRouterTransitionStart"]>) {
  sentry?.captureRouterTransitionStart(...args);
}
