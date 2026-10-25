// Every route handler, checked against a reviewed list of who may call it.
// A new route.ts (or a new method on an existing one) fails this test until
// it's added here with its rule, so nothing ships as an accidental open door.
// Each route is also called anonymously to confirm the rule holds.
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", async () => {
  const { createTestDb } = await import("../db/helpers");
  return { db: (await createTestDb()).db };
});
vi.mock("@/server/session", () => ({ getSession: vi.fn(async () => null), requireUser: vi.fn() }));
vi.mock("@/env", () => ({
  env: () => ({
    BETTER_AUTH_URL: "http://localhost:3000",
    BETTER_AUTH_SECRET: "test-only-secret-at-least-32-characters-long",
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    DATABASE_URL: "postgresql://test@localhost/test",
    CRON_SECRET: "c".repeat(32),
  }),
}));

type Handler = (request: Request) => Promise<Response>;
const req = (path: string, init?: RequestInit) => new Request(`http://localhost:3000${path}`, init);

/** Who may call each route, and what an anonymous caller gets. */
const REVIEWED: Record<string, { rule: string; methods: Record<string, (h: Handler) => Promise<void>> }> = {
  "api/auth/[...all]/route.ts": {
    rule: "Better Auth's own endpoints; see auth.test.ts",
    methods: {
      GET: async (h) => expect(await (await h(req("/api/auth/get-session"))).json()).toBeNull(),
      POST: async (h) => expect((await h(req("/api/auth/update-user", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000" }, body: "{}" }))).status).toBe(401),
    },
  },
  "api/cron/recurring/route.ts": {
    rule: "the scheduler only: Bearer CRON_SECRET",
    methods: {
      GET: async (h) => {
        expect((await h(req("/api/cron/recurring"))).status).toBe(401);
        expect((await h(req("/api/cron/recurring", { headers: { authorization: `Bearer ${"x".repeat(32)}` } }))).status).toBe(401);
      },
    },
  },
  "api/export/route.ts": {
    rule: "the signed-in user's own entries",
    methods: { GET: async (h) => expect((await h(req("/api/export"))).status).toBe(401) },
  },
  "api/health/route.ts": {
    rule: "public: says only whether the app and database are up",
    methods: {
      GET: async (h) => {
        const res = await h(req("/api/health"));
        expect(await res.json()).toEqual({ ok: true }); // nothing else, ever
        expect(res.headers.get("cache-control")).toBe("no-store");
      },
    },
  },
  "api/webhooks/razorpay/route.ts": {
    rule: "Razorpay only: HMAC signature over the raw body",
    methods: {
      POST: async (h) => {
        expect((await h(req("/api/webhooks/razorpay", { method: "POST", body: "{}" }))).status).toBe(503); // billing not set up
        for (const [k, v] of Object.entries({
          RAZORPAY_KEY_ID: "rzp_test", RAZORPAY_KEY_SECRET: "key_secret", RAZORPAY_WEBHOOK_SECRET: "whsec",
          RAZORPAY_PLAN_MONTHLY: "plan_m", RAZORPAY_PLAN_YEARLY: "plan_y",
        })) vi.stubEnv(k, v);
        expect((await h(req("/api/webhooks/razorpay", { method: "POST", body: "{}" }))).status).toBe(400); // unsigned
      },
    },
  },
};

// Listed from disk on every run (import.meta.glob is fixed when the file is
// transformed, so a cached transform could miss a newly added route).
const APP = new URL("../../src/app/", import.meta.url).pathname;
const routeFiles: string[] = [];
(function walk(dir: string) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f === "route.ts" || f === "route.tsx") routeFiles.push(p);
  }
})(APP);
const routes = Object.fromEntries(routeFiles.map((p) => [p, () => import(/* @vite-ignore */ p) as Promise<Record<string, unknown>>]));
const name = (path: string) => relative(APP, path);
const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

afterEach(() => vi.unstubAllEnvs());

describe("route handlers", () => {
  it("are all on the reviewed list, with nothing extra", () => {
    expect(Object.keys(routes).map(name).sort()).toEqual(Object.keys(REVIEWED).sort());
  });

  for (const [path, load] of Object.entries(routes)) {
    const review = REVIEWED[name(path)];
    // Loading a route loads what it uses (Better Auth, the database): slow under a full parallel run.
    it(`${name(path)} (${review?.rule ?? "not reviewed"})`, { timeout: 30_000 }, async () => {
      expect(review, `Add ${name(path)} to REVIEWED with who may call it`).toBeDefined();
      const mod = await load();
      const exported = METHODS.filter((m) => typeof mod[m] === "function");
      expect(exported, "every exported method has a reviewed rule").toEqual(Object.keys(review.methods));
      for (const m of exported) await review.methods[m](mod[m] as Handler);
    });
  }
});
