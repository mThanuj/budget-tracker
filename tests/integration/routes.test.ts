// Route handlers called the way Next calls them (a Request in, a Response out),
// against an in-memory Postgres. The session, the env loader and Razorpay's API
// are stand-ins; nothing reaches the network.
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/server/db/schema";

const session = vi.hoisted(() => ({ user: null as null | typeof import("@/server/db/schema").user.$inferSelect }));
const cron = vi.hoisted(() => ({ secret: undefined as string | undefined }));

vi.mock("@/server/db", async () => {
  const { createTestDb } = await import("../db/helpers");
  return { db: (await createTestDb()).db };
});
vi.mock("@/server/session", () => ({
  getSession: vi.fn(async () => (session.user ? { user: session.user } : null)),
  requireUser: vi.fn(),
}));
vi.mock("@/env", () => ({ env: () => ({ CRON_SECRET: cron.secret }) }));
vi.mock("@/server/billing/razorpay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/billing/razorpay")>()),
  fetchSubscription: vi.fn(),
}));

const { db } = await import("@/server/db");
const { createTestUser } = await import("../db/helpers");
const { seedNewUser } = await import("@/server/db/seed-defaults");
const { listWallets } = await import("@/server/services/wallets");
const { createTransaction } = await import("@/server/services/transactions");
const { fetchSubscription } = await import("@/server/billing/razorpay");
const { getUserPlan } = await import("@/server/billing/plan");

let alice: typeof schema.user.$inferSelect;
let bob: typeof schema.user.$inferSelect;

async function newUser(name: string) {
  const row = await createTestUser(db, { name, onboardedAt: new Date() });
  await seedNewUser(db, row.id);
  return row;
}
async function addEntry(userId: string, description: string, amount: number) {
  const [cash] = await listWallets(db, userId);
  await createTransaction(db, userId, {
    type: "expense", amount, occurredOn: "2026-10-20", description, notes: null, walletId: cash.id, toWalletId: null, categoryId: null,
  });
}

beforeAll(async () => {
  alice = await newUser("Alice");
  bob = await newUser("Bob");
});
afterEach(() => {
  session.user = null;
  cron.secret = undefined;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("GET /api/health", async () => {
  const { GET } = await import("@/app/api/health/route");

  it("is 200 when the database answers", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("is 503, without the error details, when the database is down", async () => {
    vi.spyOn(db, "execute").mockRejectedValueOnce(new Error("connection refused to db.internal:5432"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.text()).toBe('{"ok":false}');
    expect(log).toHaveBeenCalled();
  });
});

describe("GET /api/export", async () => {
  const { GET } = await import("@/app/api/export/route");

  it("is 401 when signed out", async () => {
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("is just the header row when there are no entries yet", async () => {
    session.user = bob;
    const bytes = new Uint8Array(await (await GET()).arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // the BOM Excel needs (Response.text() would drop it)
    const csv = new TextDecoder().decode(bytes);
    expect(csv.trim().split("\r\n")).toEqual(["Date,Type,Amount,Currency,Description,Category,Wallet,To wallet,Notes,Added by"]);
  });

  it("downloads only the signed-in user's entries, with formulas defused", async () => {
    await addEntry(alice.id, "=HYPERLINK(\"http://evil\")", 120_00);
    await addEntry(bob.id, "Bob's lunch", 90_00);
    session.user = alice;
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="clearpaisa-entries-\d{4}-\d{2}-\d{2}\.csv"$/);
    const csv = await res.text();
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(csv).not.toContain("Bob's lunch");
  });
});

describe("GET /api/cron/recurring", async () => {
  const { GET } = await import("@/app/api/cron/recurring/route");
  const call = (authorization?: string) =>
    GET(new Request("http://test/api/cron/recurring", { headers: authorization ? { authorization } : {} }));

  it("is 503 when no secret is configured, so it can't run open", async () => {
    expect((await call("Bearer anything")).status).toBe(503);
  });

  it("is 401 without the right bearer token", async () => {
    cron.secret = "s".repeat(32);
    expect((await call()).status).toBe(401);
    expect((await call(`Bearer ${"x".repeat(32)}`)).status).toBe(401);
    expect((await call("s".repeat(32))).status).toBe(401); // no "Bearer "
  });

  it("runs with the right token (nothing due: nothing recorded)", async () => {
    cron.secret = "s".repeat(32);
    const res = await call(`Bearer ${"s".repeat(32)}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ users: 0, recorded: 0 });
  });
});

describe("POST /api/webhooks/razorpay", async () => {
  const { POST } = await import("@/app/api/webhooks/razorpay/route");
  const SECRET = "whsec_test";
  const send = (body: string, headers: Record<string, string> = {}) =>
    POST(new Request("http://test/api/webhooks/razorpay", { method: "POST", body, headers }));
  const signed = (body: string, eventId: string) => ({
    "x-razorpay-signature": createHmac("sha256", SECRET).update(body).digest("hex"),
    "x-razorpay-event-id": eventId,
  });
  const configure = () => {
    for (const [k, v] of Object.entries({
      RAZORPAY_KEY_ID: "rzp_test", RAZORPAY_KEY_SECRET: "key_secret", RAZORPAY_WEBHOOK_SECRET: SECRET,
      RAZORPAY_PLAN_MONTHLY: "plan_m", RAZORPAY_PLAN_YEARLY: "plan_y",
    })) vi.stubEnv(k, v);
  };
  const activated = JSON.stringify({ event: "subscription.activated", payload: { subscription: { entity: { id: "sub_route" } } } });

  it("is 503 when billing isn't set up", async () => {
    expect((await send(activated)).status).toBe(503);
  });

  it("refuses unsigned and wrongly signed deliveries", async () => {
    configure();
    expect((await send(activated)).status).toBe(400);
    expect((await send(activated, { "x-razorpay-signature": "0".repeat(64) })).status).toBe(400);
    expect(fetchSubscription).not.toHaveBeenCalled();
  });

  it("asks Razorpay to retry (502) when the subscription can't be fetched", async () => {
    configure();
    vi.mocked(fetchSubscription).mockRejectedValueOnce(new Error("timeout"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await send(activated, signed(activated, "evt_retry"))).status).toBe(502);
    expect(await db.$count(schema.paymentEvent, eq(schema.paymentEvent.eventId, "evt_retry"))).toBe(0); // so the retry is handled
  });

  it("switches Pro on for a signed activation, once", async () => {
    configure();
    await db.insert(schema.subscription).values({ userId: alice.id, razorpaySubscriptionId: "sub_route", planKey: "monthly", status: "created" });
    vi.mocked(fetchSubscription).mockResolvedValue({
      id: "sub_route", plan_id: "plan_m", status: "active", current_start: Date.UTC(2026, 9, 24) / 1000,
      current_end: Date.UTC(2099, 0, 1) / 1000, ended_at: null, notes: { userId: alice.id, interval: "monthly" },
    });
    const res = await send(activated, signed(activated, "evt_route"));
    expect(res.status).toBe(200);
    expect((await getUserPlan(db, alice.id)).id).toBe("pro");

    const replay = await send(activated, signed(activated, "evt_route"));
    expect(await replay.text()).toBe("Already handled");
    expect(fetchSubscription).toHaveBeenCalledTimes(1);
  });
});
