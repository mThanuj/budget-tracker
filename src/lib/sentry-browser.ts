// The parts of the browser SDK the app uses, loaded lazily through this file
// (instrumentation-client.ts, report-client-error.ts). Importing
// "@sentry/nextjs" itself dynamically would bring the whole SDK, session replay
// and user feedback included; going through named exports lets the bundler
// leave those out.
export { captureException, captureRouterTransitionStart, init } from "@sentry/nextjs";
