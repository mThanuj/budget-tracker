// For error boundaries: React catches render errors before the browser's global
// handlers see them, so they're reported here. Errors that came from the server
// carry a digest and were already reported there (src/instrumentation.ts).
export function reportClientError(error: unknown) {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  if (error instanceof Error && "digest" in error && error.digest) return;
  void import("./sentry-browser").then((sdk) => sdk.captureException(error));
}
