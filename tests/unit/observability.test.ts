import { readdirSync, readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestError } from "@/instrumentation";
import { proxy } from "@/proxy";
import { requestIdFrom } from "@/server/request-id";
import { setErrorReporter } from "@/server/log";

const session = vi.hoisted(() => ({ user: { email: "owner@example.com", emailVerified: true } }));
vi.mock("@/server/session", () => ({ requireUser: vi.fn(async () => session.user) }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  setErrorReporter(undefined);
});

describe("request ids", () => {
  it("uses Vercel's id, or the one the proxy adds elsewhere", () => {
    expect(requestIdFrom(new Headers({ "x-vercel-id": "sin1::abc", "x-request-id": "r1" }))).toBe("sin1::abc");
    expect(requestIdFrom({ "x-request-id": ["r1", "r2"] })).toBe("r1");
    expect(requestIdFrom({})).toBeUndefined();
  });

  it("the proxy adds an id to page requests that don't have one, and keeps Vercel's", () => {
    const added = proxy(new NextRequest("http://localhost:3000/privacy"));
    expect(added.headers.get("x-middleware-request-x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    const vercel = proxy(new NextRequest("http://localhost:3000/privacy", { headers: { "x-vercel-id": "sin1::abc" } }));
    expect(vercel.headers.get("x-middleware-request-x-request-id")).toBeNull();
  });
});

describe("onRequestError", () => {
  it("writes one scrubbed line: route, request id, no query string, cookies or query parameters", async () => {
    const out = vi.spyOn(console, "error").mockImplementation(() => {});
    await onRequestError(
      new Error("Failed query: select … where description = $1\nparams: rent for Ravi"),
      {
        path: "/ask?q=how%20much%20did%20I%20spend",
        method: "POST",
        headers: { cookie: "better-auth.session_token=abc.def", "x-vercel-id": "sin1::req-9" },
      },
      {
        routerKind: "App Router",
        routePath: "/(app)/ask",
        routeType: "action",
        renderSource: "react-server-components",
        revalidateReason: undefined,
      },
    );
    expect(out).toHaveBeenCalledTimes(1);
    const line = String(out.mock.calls[0][0]);
    expect(line).toContain("request.failed");
    expect(line).toContain("sin1::req-9");
    expect(line).toContain("/(app)/ask");
    expect(line).not.toMatch(/how%20much|rent for Ravi|session_token|abc\.def/);
  });
});

describe("the admin page's test error", async () => {
  const { sendTestError } = await import("@/server/actions/admin");
  const isNotFound = (err: unknown) =>
    err instanceof Error && "digest" in err && String(err.digest).startsWith("NEXT_HTTP_ERROR_FALLBACK;404");

  it("is a plain 404 for anyone who isn't an admin, and reports nothing", async () => {
    vi.stubEnv("ADMIN_EMAILS", "someone-else@example.com");
    const reporter = vi.fn();
    setErrorReporter(reporter);
    await expect(sendTestError()).rejects.toSatisfy(isNotFound);
    expect(reporter).not.toHaveBeenCalled();
  });

  it("reports one error for an admin, without who sent it", async () => {
    vi.stubEnv("ADMIN_EMAILS", "owner@example.com");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reporter = vi.fn();
    setErrorReporter(reporter);
    expect(await sendTestError()).toEqual({ sent: false }); // no DSN in tests
    expect(reporter).toHaveBeenCalledTimes(1);
    const [err, event, fields] = reporter.mock.calls[0];
    expect(event).toBe("monitoring.test_error");
    expect(String(err)).toContain("safe to ignore");
    expect(JSON.stringify(fields)).not.toContain("owner@example.com");
  });
});

describe("server code", () => {
  it("logs through src/server/log.ts, so every line is structured and redacted", () => {
    const root = new URL("../../", import.meta.url);
    const files = [
      ...["src/server", "src/app/api"].flatMap((dir) =>
        readdirSync(new URL(dir, root), { recursive: true, encoding: "utf8" }).map((f) => `${dir}/${f}`),
      ),
      "src/env.ts",
      "src/instrumentation.ts",
      "src/proxy.ts",
      "src/sentry.server.config.ts",
    ].filter((f) => /\.tsx?$/.test(f) && f !== "src/server/log.ts");
    expect(files.length).toBeGreaterThan(30);
    const offenders = files.filter((f) =>
      /\bconsole\.(log|info|warn|error|debug)\(/.test(readFileSync(new URL(f, root), "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
