// The parts of the browser SDK the app uses, loaded lazily through this file
// (instrumentation-client.ts, report-client-error.ts). Importing
// "@sentry/nextjs" itself dynamically would bring the whole SDK, user feedback
// included; going through named exports lets the bundler leave out what isn't
// used.
export {
  addEventProcessor,
  captureException,
  captureRouterTransitionStart,
  getReplay,
  init,
  replayIntegration,
} from "@sentry/nextjs";
