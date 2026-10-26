// Sentry for the edge runtime (only when NEXT_PUBLIC_SENTRY_DSN is set).
// Loaded by register() in src/instrumentation.ts.
import * as Sentry from "@sentry/nextjs";
import { baseOptions, scrubTraceHeader } from "./lib/monitoring";

scrubTraceHeader(Sentry.init(baseOptions("edge")));
