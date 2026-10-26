// Shared Sentry options and the scrubber every event passes through before it
// leaves the app (server, edge and browser). Pure and dependency-free (types
// only), so it can be unit-tested and loaded in the browser.
//
// What's kept: error type, scrubbed message and stack, route, method, release,
// environment, timings. What's never sent: request headers, cookies, bodies,
// query strings, user identity (email, IP), local variables, typed or
// displayed text (entry descriptions, AI questions), AI prompts or answers.
// Two layers: DATA_COLLECTION stops the SDK collecting it, and the scrubbers
// remove anything that gets through.
import type { Breadcrumb, ErrorEvent, init } from "@sentry/nextjs";
import { MONITORING } from "@/config/monitoring";
import { redact, scrubText } from "./redact";

// The SDK doesn't export these types from its Next.js package; take them from init().
type InitOptions = NonNullable<Parameters<typeof init>[0]>;
type StreamedSpan = Parameters<NonNullable<InitOptions["beforeSendSpan"]>>[0];
type Client = ReturnType<typeof init>;

/**
 * What the SDK may collect in the first place. Its defaults collect everything
 * (user details, headers, cookies, bodies, query strings, database values, AI
 * content), so every category is switched off here; the scrubbers below are a
 * second line. `userInfo: false` also stops Sentry inferring IP addresses.
 * Source lines around stack frames (the app's own code) are kept.
 */
export const DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
} satisfies InitOptions["dataCollection"];

/** The browser and server both read this at build time; unset means monitoring is off. */
export const sentryDsn = () => process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || undefined;

/** Removes everything that could identify a user or reveal their data. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    event.request = {
      method: event.request.method,
      url: event.request.url ? scrubText(event.request.url) : undefined,
    };
  }
  delete event.user;
  delete event.server_name; // the host's name (a developer machine, or the platform's internal host)
  if (event.message) event.message = scrubText(event.message);
  if (event.transaction) event.transaction = scrubText(event.transaction);
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = scrubText(ex.value);
    for (const frame of ex.stacktrace?.frames ?? []) delete frame.vars;
  }
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.flatMap((b: Breadcrumb) => scrubBreadcrumb(b) ?? []);
  if (event.extra) event.extra = redact(event.extra) as typeof event.extra;
  if (event.tags) event.tags = redact(event.tags) as typeof event.tags;
  // Every context gets the same treatment: Next.js's context, for one, carries the
  // raw request path with its query string.
  for (const [name, context] of Object.entries(event.contexts ?? {})) {
    if (!context || !event.contexts) continue;
    event.contexts[name] =
      name === "trace"
        ? { ...context, ...(context.data ? { data: redact(context.data) as Record<string, unknown> } : {}) }
        : (redact(context) as typeof context);
  }
  return event;
}

/**
 * Traces are sent span by span (the SDK's default "stream" lifecycle), past
 * beforeSend, so each span gets the same treatment: query strings out of its
 * name and URLs, and private attributes (headers, bodies, query strings, IP
 * addresses, user fields: see SENSITIVE_KEY in ./redact) replaced.
 */
export function scrubSpan(span: StreamedSpan): StreamedSpan {
  span.name = scrubText(span.name);
  span.attributes = redact(span.attributes) as typeof span.attributes;
  return span;
}

/**
 * Every envelope carries a trace header that names the request it belongs to
 * (Sentry's dynamic sampling context), outside beforeSend and beforeSendSpan:
 * no query string there either. Call with the client init() returns.
 */
export function scrubTraceHeader(client: Client) {
  client?.on("createDsc", (dsc) => {
    if (dsc.transaction) dsc.transaction = scrubText(dsc.transaction);
  });
}

/** Click and typing breadcrumbs can carry on-screen text (entry descriptions, amounts): dropped. */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.category?.startsWith("ui.")) return null;
  if (breadcrumb.message) breadcrumb.message = scrubText(breadcrumb.message);
  if (breadcrumb.data) breadcrumb.data = redact(breadcrumb.data) as Record<string, unknown>;
  return breadcrumb;
}

// Integrations that can attach AI prompts and answers to traces. AI calls stay
// visible as plain HTTP spans (URL and duration).
// Matched against the SDK's own names (VercelAI, OpenAI, Anthropic_AI,
// Google_GenAI, Groq, …): anything with "AI" as a word part, plus the others.
const AI_INTEGRATION = /AI(?![a-z])|Groq|LangChain|LangGraph|Mistral|Together|Mastra/;
export const withoutAiIntegrations = <I extends { name: string }>(integrations: I[]) =>
  integrations.filter((i) => !AI_INTEGRATION.test(i.name));

/** Options shared by every runtime. */
export function baseOptions(runtime: "server" | "edge" | "browser") {
  return {
    dsn: sentryDsn(),
    enabled: Boolean(sentryDsn()),
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    dataCollection: DATA_COLLECTION,
    sampleRate: MONITORING.errorSampleRate,
    tracesSampleRate: runtime === "browser" ? MONITORING.clientTracesSampleRate : MONITORING.serverTracesSampleRate,
    beforeSend: (event: ErrorEvent) => scrubEvent(event),
    beforeSendSpan: (span: StreamedSpan) => scrubSpan(span),
    beforeBreadcrumb: (breadcrumb: Breadcrumb) => scrubBreadcrumb(breadcrumb),
  } satisfies InitOptions; // an option the SDK doesn't know is a type error, not silently ignored
}
