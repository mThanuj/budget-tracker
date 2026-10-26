// What error monitoring may send, checked on the real SDK pipeline with the
// app's own server setup (src/sentry.server.config.ts) and a transport that
// keeps events in memory (nothing leaves the machine).
import { readFileSync } from "node:fs";
import * as Sentry from "@sentry/nextjs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MONITORING } from "@/config/monitoring";
import {
  baseOptions,
  browserOptions,
  DATA_COLLECTION,
  REPLAY_OPTIONS,
  replayAllowedAt,
  scrubBreadcrumb,
  scrubEvent,
  scrubRecordingEvent,
  scrubReplayEvent,
  scrubSpan,
  withoutAiIntegrations,
} from "@/lib/monitoring";
import { log } from "@/server/log";

const sent = vi.hoisted(() => [] as string[]);
vi.mock("@sentry/nextjs", async (importOriginal) => {
  const sdk = await importOriginal<typeof import("@sentry/nextjs")>();
  // Most of the SDK's exports sit on the module's prototype (CommonJS interop),
  // which spreading would lose; inherit them instead.
  return Object.assign(Object.create(sdk), {
    // The app's options, with three changes for the test: events kept in memory,
    // every request traced (so spans are checked too), and no ContextLines,
    // which attaches nearby source lines to stack frames: the nearby source
    // here is this test, which spells out the fake secrets.
    init: (options: NonNullable<Parameters<typeof sdk.init>[0]>) =>
      sdk.init({
        ...options,
        tracesSampleRate: 1,
        integrations: (defaults) =>
          (typeof options.integrations === "function" ? options.integrations(defaults) : defaults).filter(
            (i) => i.name !== "ContextLines",
          ),
        transport: () => ({
          send: async (envelope: unknown) => {
            sent.push(JSON.stringify(envelope));
            return {};
          },
          flush: async () => true,
        }),
      }),
  });
});

const SECRET_BITS = /how%20much|rent for Ravi|asha@example\.com|session_token|Bearer abc|203\.0\.113\.7|Chai with Ravi/;

describe("scrubEvent", () => {
  it("drops request headers, cookies, bodies, query strings, user identity and local variables", () => {
    const event = scrubEvent({
      type: undefined,
      message: "mail asha@example.com",
      request: {
        url: "https://clearpaisa.app/ask?q=how%20much",
        method: "POST",
        headers: { cookie: "better-auth.session_token=x", authorization: "Bearer abc" },
        cookies: { a: "b" },
        data: { description: "rent for Ravi" },
        query_string: "q=how%20much",
      },
      user: { email: "asha@example.com", ip_address: "203.0.113.7" },
      exception: {
        values: [
          {
            type: "Error",
            value: "Failed query: insert …\nparams: rent for Ravi",
            stacktrace: { frames: [{ filename: "a.ts", vars: { description: "rent for Ravi" } }] },
          },
        ],
      },
      breadcrumbs: [
        { category: "ui.click", message: "button.row > span (Chai with Ravi)" },
        { category: "navigation", data: { from: "/ask?q=how%20much", to: "/dashboard" } },
      ],
      extra: { note: "asha@example.com", token: "t" },
    });
    expect(event.request).toEqual({ method: "POST", url: "https://clearpaisa.app/ask?[redacted]" });
    expect(event.user).toBeUndefined();
    expect(event.exception?.values?.[0].stacktrace?.frames?.[0].vars).toBeUndefined();
    expect(event.breadcrumbs).toHaveLength(1);
    expect(JSON.stringify(event)).not.toMatch(SECRET_BITS);
  });

  it("drops click and typing breadcrumbs, keeps the rest scrubbed", () => {
    expect(scrubBreadcrumb({ category: "ui.input", message: "input[name=description]" })).toBeNull();
    expect(
      scrubBreadcrumb({ category: "http", data: { url: "https://api.groq.com/x?key=1", "url.query": "key=1" } }),
    ).toEqual({
      category: "http",
      data: { url: "https://api.groq.com/x?[redacted]", "url.query": "[redacted]" },
    });
  });

  it("takes headers, bodies, query strings, IP addresses and user fields out of trace spans", () => {
    const span = scrubSpan({
      trace_id: "t",
      span_id: "s",
      name: "GET /ask?q=how%20much",
      start_timestamp: 0,
      status: "ok",
      is_segment: true,
      attributes: {
        "url.full": "https://clearpaisa.app/ask?q=how%20much",
        "url.query": "q=how%20much",
        "http.request.header.x_forwarded_for": "203.0.113.7",
        "http.request.header.cookie": "better-auth.session_token=x",
        "http.request.body.data": "rent for Ravi",
        "client.address": "203.0.113.7",
        "user.ip_address": "203.0.113.7",
        "user.email": "asha@example.com",
        "db.query.text": "select * from wallet where user_id = $1",
        "http.response.status_code": 200,
      },
    });
    expect(span.name).toBe("GET /ask?[redacted]");
    expect(span.attributes).toMatchObject({
      "url.full": "https://clearpaisa.app/ask?[redacted]",
      "db.query.text": "select * from wallet where user_id = $1",
      "http.response.status_code": 200,
    });
    expect(JSON.stringify(span)).not.toMatch(SECRET_BITS);
  });

  it("asks every runtime's SDK not to collect user data in the first place", () => {
    for (const runtime of ["server", "edge", "browser"] as const)
      expect(baseOptions(runtime).dataCollection).toEqual(DATA_COLLECTION);
    expect(Object.values(DATA_COLLECTION).flatMap((v) => (typeof v === "object" ? Object.values(v) : [v]))).toEqual(
      expect.not.arrayContaining([true]),
    );
  });

  it("expects the daily job when vercel.json schedules it", () => {
    const vercel = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));
    expect(vercel.crons).toContainEqual({
      path: "/api/cron/recurring",
      schedule: MONITORING.recurringJob.schedule.vercel,
    });
  });

  it("removes integrations that can record AI prompts and answers", () => {
    const names = [
      "Http",
      "Postgres",
      "VercelAI",
      "OpenAI",
      "Groq",
      "Anthropic_AI",
      "Google_GenAI",
      "Console",
      "Mysql2",
    ];
    expect(withoutAiIntegrations(names.map((name) => ({ name }))).map((i) => i.name)).toEqual([
      "Http",
      "Postgres",
      "Console",
      "Mysql2",
    ]);
  });
});

describe("session replay (browser)", () => {
  it("records only visits with an error, with everything on screen masked and no network details", () => {
    expect(MONITORING.replay).toEqual({ sessionSampleRate: 0, onErrorSampleRate: 1 });
    expect(REPLAY_OPTIONS).toMatchObject({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
      networkDetailAllowUrls: [],
      networkCaptureBodies: false,
    });
    expect(REPLAY_OPTIONS.maskAttributes).toEqual(expect.arrayContaining(["aria-label", "title", "href", "alt"]));
    const replay = vi.fn((options: unknown) => ({ name: "Replay", options }));
    const options = browserOptions(replay as never);
    expect(options).toMatchObject({ replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 1 });
    expect(replay).toHaveBeenCalledWith(REPLAY_OPTIONS);
  });

  it("pauses wherever the address has a query string (it can carry a question or a search)", () => {
    expect(replayAllowedAt("")).toBe(true);
    expect(replayAllowedAt("?q=how%20much")).toBe(false);
    expect(replayAllowedAt("?month=2026-10")).toBe(false);
  });

  it("takes on-screen words out of replay's click records, and query strings out of its URLs", () => {
    const click = scrubRecordingEvent({
      type: 5,
      timestamp: 1,
      data: {
        tag: "breadcrumb",
        payload: {
          timestamp: 1,
          type: "default",
          category: "ui.click",
          message: 'button[aria-label="Delete Chai with Ravi"]',
          data: {
            nodeId: 3,
            node: {
              id: 3,
              tagName: "button",
              textContent: "****",
              attributes: { "aria-label": "Delete Chai with Ravi" },
            },
          },
        },
      },
    });
    const navigation = scrubRecordingEvent({
      type: 5,
      timestamp: 1,
      data: {
        tag: "performanceSpan",
        payload: {
          op: "navigation.push",
          description: "https://clearpaisa.app/ask?q=how%20much",
          startTimestamp: 1,
          endTimestamp: 1,
          data: { previous: "https://clearpaisa.app/transactions?q=Chai%20with%20Ravi" },
        },
      },
    });
    const replayEvent = scrubReplayEvent({
      type: "replay_event",
      urls: ["https://clearpaisa.app/ask?q=how%20much"],
      request: { url: "https://clearpaisa.app/ask?q=how%20much", headers: { "User-Agent": "x" } },
      user: { ip_address: "203.0.113.7" },
    } as Parameters<typeof scrubReplayEvent>[0]);
    const all = JSON.stringify([click, navigation, replayEvent]);
    expect(all).not.toMatch(SECRET_BITS);
    expect(all).not.toMatch(/Chai%20with%20Ravi|Delete Chai/);
    expect(all).toContain("/ask?[redacted]");
    expect(click.data.payload).toMatchObject({ category: "ui.click", data: { node: { tagName: "button" } } });
  });
});

describe("the real SDK pipeline (server)", () => {
  beforeEach(() => {
    sent.length = 0;
  });
  afterAll(async () => {
    await Sentry.close();
    vi.unstubAllEnvs();
  });

  it("starts without the integrations that can record AI prompts and answers", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@o1.ingest.sentry.io/1");
    await import("@/sentry.server.config");
    const active =
      Sentry.getClient()
        ?.getOptions()
        .integrations.map((i) => i.name) ?? [];
    expect(active).toContain("Http");
    expect(active.filter((n) => /AI(?![a-z])|Groq|LangChain|LangGraph|Mistral|Together|Mastra/.test(n))).toEqual([]);
    // What the SDK resolved, not just what was passed: its defaults collect everything.
    expect(Sentry.getClient()?.getDataCollectionOptions()).toMatchObject({
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      urlQueryParams: false,
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      stackFrameVariables: false,
    });
  });

  it("sends an unexpected request error without the request's private parts", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {}); // onRequestError's own log line
    const { onRequestError } = await import("@/instrumentation");
    const err = Object.assign(new Error("Failed query: select … where description = $1\nparams: rent for Ravi"), {
      digest: "4085121356",
    });
    await onRequestError(
      err,
      {
        path: "/ask?q=how%20much",
        method: "POST",
        headers: {
          cookie: "better-auth.session_token=x",
          authorization: "Bearer abc",
          "x-forwarded-for": "203.0.113.7",
          "x-vercel-id": "sin1::req-9",
        },
      },
      { routerKind: "App Router", routePath: "/(app)/ask", routeType: "render", revalidateReason: undefined },
    );
    await Sentry.flush(2_000);
    expect(sent.length).toBeGreaterThan(0);
    const all = sent.join("\n");
    expect(all).toContain("Failed query");
    expect(all).not.toMatch(SECRET_BITS);
    expect(all).not.toMatch(/"cookie"|"authorization"|x-forwarded-for/i);
    expect(all).not.toContain('"server_name"');
    expect(all).toContain('"request_path":"/ask"'); // the SDK leaves the query string out (dataCollection)
    // Searchable by the request id and by the reference the error page shows.
    expect(all).toContain('"request_id":"sin1::req-9"');
    expect(all).toContain('"digest":"4085121356"');
    vi.restoreAllMocks();
  });

  it("sends trace spans without the request's private parts", async () => {
    Sentry.startSpan(
      {
        name: "POST /ask?q=how%20much",
        op: "http.server",
        attributes: {
          "url.full": "https://clearpaisa.app/ask?q=how%20much",
          "http.request.header.x_forwarded_for": "203.0.113.7",
          "http.request.body.data": "rent for Ravi",
          "client.address": "203.0.113.7",
        },
      },
      () => Sentry.startSpan({ name: "select wallet", op: "db" }, () => undefined),
    );
    await Sentry.flush(2_000);
    const all = sent.join("\n");
    expect(all).toContain("select wallet"); // spans were sent
    expect(all).toContain("POST /ask?[redacted]");
    expect(all).not.toMatch(SECRET_BITS);
    expect(all).not.toContain('"infer_ip":"auto"');
  });

  it("sends a handled failure logged with log.error, tagged with its event, scrubbed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    log.error("billing.checkout_start_failed", {
      err: new Error("Razorpay refused the checkout for asha@example.com"),
      description: "rent for Ravi",
      sessionToken: "session_token=abc",
      requestId: "sin1::req-1",
    });
    log.error("billing.cancel_failed", { err: new Error("not reported") }, { report: false });
    await Sentry.flush(2_000);
    const all = sent.join("\n");
    expect(all).toContain("Razorpay refused the checkout for [email]");
    expect(all).toContain('"event":"billing.checkout_start_failed"');
    expect(all).toContain('"handled":"yes"');
    expect(all).toContain("sin1::req-1");
    expect(all).not.toContain("not reported");
    expect(all).not.toMatch(SECRET_BITS);
    vi.restoreAllMocks();
  });
});
