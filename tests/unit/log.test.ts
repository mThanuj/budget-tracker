import { afterEach, describe, expect, it, vi } from "vitest";
import { log, redact, scrubText } from "@/server/log";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("redact", () => {
  it("hides credentials and user-written text by field name, at any depth", () => {
    expect(
      redact({
        authorization: "Bearer abc",
        headers: { cookie: "better-auth.session_token=x", "x-razorpay-signature": "deadbeef" },
        apiKey: "gsk_123",
        user: { password: "p", sessionToken: "t" },
        amountMinor: 1200,
        entry: { description: "Chai with Ravi", notes: "x" },
        question: "how much on rent?",
      }),
    ).toEqual({
      authorization: "[redacted]",
      headers: { cookie: "[redacted]", "x-razorpay-signature": "[redacted]" },
      apiKey: "[redacted]",
      user: { password: "[redacted]", sessionToken: "[redacted]" },
      amountMinor: 1200,
      entry: { description: "[redacted]", notes: "[redacted]" },
      question: "[redacted]",
    });
  });

  it("removes emails, URL query strings and database query parameters from text", () => {
    expect(scrubText("owner asha@example.com signed in")).toBe("owner [email] signed in");
    expect(scrubText("Owner: A.Rao+bills@Mail.Example.co.in")).toBe("Owner: [email]");
    const stack = "at run (node_modules/.pnpm/vitest@5.0.5_@types+node@24.19.2/node_modules/vitest/dist/run.js:9:1)";
    expect(scrubText(stack)).toBe(stack); // package versions aren't emails
    expect(scrubText("GET /ask?q=how%20much%20on%20rent failed")).toBe("GET /ask?[redacted] failed");
    expect(scrubText("fetch https://api.groq.com/v1/x?key=1 timed out")).toBe(
      "fetch https://api.groq.com/v1/x?[redacted] timed out",
    );
    expect(
      scrubText('Failed query: select * from "transaction" where "description" = $1\nparams: Chai with Ravi,u_1'),
    ).toBe('Failed query: select * from "transaction" where "description" = $1\nparams: [redacted]');
    expect(scrubText("x".repeat(3000))).toHaveLength(2001);
  });

  it("keeps an error's name, message, code, digest and cause, scrubbed", () => {
    const cause = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    const err = Object.assign(new Error("Failed query: insert …\nparams: secret note", { cause }), { digest: "123" });
    const out = redact({ err }) as { err: Record<string, unknown> };
    expect(out.err).toMatchObject({
      name: "Error",
      message: "Failed query: insert …\nparams: [redacted]",
      digest: "123",
    });
    expect(out.err.cause).toMatchObject({ message: "connect ECONNREFUSED", code: "ECONNREFUSED" });
    expect(String(out.err.stack)).not.toContain("secret note");
  });

  it("caps depth and list length so a huge object can't flood the logs", () => {
    expect(redact({ a: { b: { c: { d: { e: 1 } } } } })).toEqual({ a: { b: { c: { d: "[too deep]" } } } });
    expect(redact(Array.from({ length: 50 }, (_, i) => i))).toHaveLength(20);
  });
});

describe("log", () => {
  it("writes one JSON line per event in production, with level, event and environment", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.resetModules();
    const { log: prodLog } = await import("@/server/log");
    const out = vi.spyOn(console, "error").mockImplementation(() => {});
    prodLog.error("billing.checkout_start_failed", { err: new Error("timeout"), requestId: "sin1::abc", token: "t" });
    const line = JSON.parse(String(out.mock.calls[0][0]));
    expect(line).toMatchObject({
      level: "error",
      event: "billing.checkout_start_failed",
      env: "production",
      requestId: "sin1::abc",
      token: "[redacted]",
    });
    expect(line.err).toMatchObject({ name: "Error", message: "timeout" });
    expect(new Date(line.ts).toString()).not.toBe("Invalid Date");
  });

  it("reports through the reporter another copy of the module registered", async () => {
    // Next bundles src/instrumentation.ts (which registers Sentry's reporter)
    // apart from the app, so the app's copy of the logger is a different module.
    const reporter = vi.fn();
    (await import("@/server/log")).setErrorReporter(reporter);
    vi.resetModules();
    const appCopy = await import("@/server/log");
    vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      appCopy.log.error("monitoring.test_error", { err: new Error("x") });
      expect(reporter).toHaveBeenCalledTimes(1);
    } finally {
      appCopy.setErrorReporter(undefined);
    }
  });

  it("sends each level to the matching console stream and skips debug unless asked", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const info = vi.spyOn(console, "log").mockImplementation(() => {});
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    log.error("a.b");
    log.warn("a.b");
    log.info("a.b");
    log.debug("a.b");
    expect([err, warn, info].map((s) => s.mock.calls.length)).toEqual([1, 1, 1]);
    expect(debug).not.toHaveBeenCalled();
    vi.stubEnv("LOG_LEVEL", "debug");
    log.debug("a.b");
    expect(debug).toHaveBeenCalledTimes(1);
  });
});
