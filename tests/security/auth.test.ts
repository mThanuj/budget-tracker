// Better Auth, configured as the app configures it (src/server/auth.ts), called
// the way a browser or an attacker would: through its HTTP handler.
//
// Better Auth turns its origin and callback-URL checks off under test runners
// (NODE_ENV=test), so this file switches to production behaviour before it
// loads, and puts the environment back afterwards.
import { createHmac } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/server/db/schema";

vi.hoisted(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("TEST", undefined);
});

const SECRET = "test-only-secret-at-least-32-characters-long";
const ORIGIN = "http://localhost:3000";
vi.mock("@/server/db", async () => {
  const { createTestDb } = await import("../db/helpers");
  return { db: (await createTestDb()).db };
});
vi.mock("@/env", () => ({
  env: () => ({
    BETTER_AUTH_URL: "http://localhost:3000",
    BETTER_AUTH_SECRET: "test-only-secret-at-least-32-characters-long",
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    DATABASE_URL: "postgresql://test@localhost/test",
  }),
}));

const { auth } = await import("@/server/auth");
const { db } = await import("@/server/db");
const { createTestUser } = await import("../db/helpers");

afterAll(() => vi.unstubAllEnvs());

const call = (
  path: string,
  { body, cookie, origin = ORIGIN, ip }: { body?: unknown; cookie?: string; origin?: string; ip?: string } = {},
) =>
  auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(body !== undefined && { "content-type": "application/json", origin }),
        ...(cookie && { cookie }),
        ...(ip && { "x-forwarded-for": ip }), // what Vercel sets: the client's address alone
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );

/** A real session for `userId`, as the browser would hold it (a signed cookie). */
async function sessionCookie(userId: string) {
  const ctx = await auth.$context;
  const { token } = await ctx.internalAdapter.createSession(userId);
  const signature = createHmac("sha256", SECRET).update(token).digest("base64");
  return `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}

let userId: string;
let cookie: string;
beforeAll(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {}); // Better Auth logs each refusal
  userId = (await createTestUser(db, { name: "Alice", currency: "INR" })).id;
  cookie = await sessionCookie(userId);
});

describe("sessions", () => {
  it("accepts the real cookie and nothing forged", async () => {
    expect((await (await call("/get-session", { cookie })).json())?.user?.id).toBe(userId);
    const forged = cookie.replace(
      /\.[^.]+$/,
      `.${encodeURIComponent(createHmac("sha256", "wrong-secret").update("x").digest("base64"))}`,
    );
    expect(await (await call("/get-session", { cookie: forged })).json()).toBeNull();
    expect(await (await call("/get-session")).json()).toBeNull();
  });
});

describe("cross-site requests (CSRF) and redirects", () => {
  it("refuses a state-changing request from another site, even with the cookie", async () => {
    const res = await call("/sign-out", { body: {}, cookie, origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect((await (await call("/get-session", { cookie })).json())?.user?.id).toBe(userId); // still signed in
  });

  it("only sends people back to this site after Google sign-in", async () => {
    expect(
      (await call("/sign-in/social", { body: { provider: "google", callbackURL: "https://evil.example/steal" } }))
        .status,
    ).toBe(403);
    const ok = await call("/sign-in/social", { body: { provider: "google", callbackURL: "/dashboard" } });
    expect(ok.status).toBe(200);
    expect((await ok.json()).url).toMatch(/^https:\/\/accounts\.google\.com\//);
  });
});

describe("what a signed-in user can change about their account", () => {
  it("can't set the app's own fields (mass assignment)", async () => {
    for (const field of [
      { currency: "USD" },
      { timezone: "UTC" },
      { aiEnabled: false },
      { onboardedAt: "2020-01-01" },
      { defaultWalletId: crypto.randomUUID() },
    ]) {
      expect((await call("/update-user", { body: field, cookie })).status, JSON.stringify(field)).toBe(400);
    }
    const [row] = await db.select().from(schema.user).where(eq(schema.user.id, userId));
    expect(row).toMatchObject({ currency: "INR", aiEnabled: true, onboardedAt: null, defaultWalletId: null });
  });

  it("can't change the email (the admin check relies on it)", async () => {
    expect(
      (await call("/update-user", { body: { email: "owner@example.com", emailVerified: true }, cookie })).status,
    ).toBe(400);
    expect((await call("/change-email", { body: { newEmail: "owner@example.com" }, cookie })).status).toBe(400);
    const [row] = await db.select().from(schema.user).where(eq(schema.user.id, userId));
    expect(row.email).toBe(`${userId}@example.com`);
    expect(row.emailVerified).toBe(false);
  });

  it("has no password sign-up, and account deletion only through the app (which cancels Pro first)", async () => {
    expect(
      (await call("/sign-up/email", { body: { email: "a@example.com", password: "password1234", name: "A" } })).status,
    ).toBe(400);
    expect((await call("/delete-user", { body: {}, cookie })).status).toBe(404);
    expect((await call("/update-user", { body: { name: "Signed out" } })).status).toBe(401);
  });
});

describe("rate limiting", () => {
  it("is on for Better Auth's own endpoints in production, counted in the database", async () => {
    // In the database, so every serverless instance shares the counts (D-026).
    expect((await auth.$context).rateLimit).toMatchObject({ enabled: true, storage: "database" });
  });

  it("allows 3 sign-in attempts per 10 seconds from one address", async () => {
    const signIn = (ip: string) => call("/sign-in/social", { body: { provider: "google", callbackURL: "/" }, ip });
    for (let i = 0; i < 3; i++) expect((await signIn("203.0.113.7")).status).toBe(200);
    expect((await signIn("203.0.113.7")).status).toBe(429);
    expect((await signIn("198.51.100.2")).status).toBe(200); // another address has its own count
    expect(await db.$count(schema.rateLimit, like(schema.rateLimit.key, "203.0.113.7|%"))).toBe(1);
  });
});
