// How many database queries a signed-in request pays to find its session:
// Better Auth with the app's configuration (src/server/auth.ts) on PGlite,
// with every query counted. Every page waits for this before its own data.
import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

const queries = vi.hoisted(() => [] as string[]);
const SECRET = "test-only-secret-at-least-32-characters-long";
vi.mock("@/server/db", async () => {
  const { createTestDb } = await import("../db/helpers");
  return { db: (await createTestDb({ logger: { logQuery: (q) => queries.push(q) } })).db };
});
vi.mock("@/env", () => ({
  env: () => ({
    BETTER_AUTH_URL: "http://localhost:3000",
    BETTER_AUTH_SECRET: SECRET,
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    DATABASE_URL: "postgresql://test@localhost/test",
  }),
}));

const { auth } = await import("@/server/auth");
const { db } = await import("@/server/db");
const { createTestUser } = await import("../db/helpers");

describe("finding the session", () => {
  let cookie: string;
  let userId: string;

  beforeAll(async () => {
    userId = (await createTestUser(db, { aiEnabled: false })).id;
    const { token } = await (await auth.$context).internalAdapter.createSession(userId);
    const signature = createHmac("sha256", SECRET).update(token).digest("base64");
    cookie = `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
  });

  it("takes one query, the session and its user together", async () => {
    queries.length = 0;
    const found = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(found?.user).toMatchObject({ id: userId, aiEnabled: false, mainIncomeCategoryId: null });
    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatch(/from "session"[\s\S]*"user"/);
  });
});
