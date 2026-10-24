import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aiAccess } from "@/server/ai/access";
import { getUserPlan } from "@/server/billing/plan";
import type { RazorpayConfig, RazorpaySubscription } from "@/server/billing/razorpay";
import { handleRazorpayWebhook } from "@/server/billing/subscriptions";
import { paymentEvent, subscription } from "@/server/db/schema";
import { createTestDb, createTestUser } from "./helpers";

const cfg: RazorpayConfig = { keyId: "rzp_test", keySecret: "key_secret", webhookSecret: "whsec", plans: { monthly: "plan_m", yearly: "plan_y" } };
const unix = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
const deliver = (body: object, eventId: string) => {
  const rawBody = JSON.stringify(body);
  return { rawBody, eventId, signature: createHmac("sha256", cfg.webhookSecret).update(rawBody).digest("hex") };
};
const event = (name: string, id: string) => ({ event: name, payload: { subscription: { entity: { id, status: "ignored" } } } });

describe("Razorpay webhooks", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let userId: string;
  // What Razorpay's API says right now; the webhook payload itself is never trusted.
  let remote: RazorpaySubscription;
  let fetches = 0;
  const fetchLatest = async () => {
    fetches++;
    return remote;
  };

  beforeAll(async () => {
    t = await createTestDb();
    userId = (await createTestUser(t.db)).id;
    await t.db.insert(subscription).values({ userId, razorpaySubscriptionId: "sub_1", planKey: "monthly", status: "created" });
    remote = {
      id: "sub_1", plan_id: "plan_m", status: "active", current_start: unix("2026-10-24T00:00:00Z"),
      current_end: unix("2026-11-24T00:00:00Z"), ended_at: null, notes: { userId, interval: "monthly" },
    };
  });
  afterAll(() => t.close());

  it("rejects deliveries without a valid signature", async () => {
    const d = deliver(event("subscription.activated", "sub_1"), "evt_bad");
    const res = await handleRazorpayWebhook(t.db, cfg, { ...d, signature: "0".repeat(64) }, fetchLatest);
    expect(res.status).toBe(400);
    expect((await getUserPlan(t.db, userId, new Date("2026-10-25T00:00:00Z"))).id).toBe("free");
  });

  it("switches Pro on from the latest state, and ignores replays", async () => {
    const d = deliver(event("subscription.activated", "sub_1"), "evt_1");
    expect((await handleRazorpayWebhook(t.db, cfg, d, fetchLatest)).status).toBe(200);
    const plan = await getUserPlan(t.db, userId, new Date("2026-10-25T00:00:00Z"));
    expect(plan).toMatchObject({ id: "pro", limits: { chatDaily: 100 }, subscription: { renewsAt: new Date("2026-11-24T00:00:00Z") } });

    const before = fetches;
    expect(await handleRazorpayWebhook(t.db, cfg, d, fetchLatest)).toEqual({ status: 200, body: "Already handled" });
    expect(fetches).toBe(before);
    expect(await t.db.select().from(paymentEvent)).toHaveLength(1);
  });

  it("uses the API's state even when events arrive out of order", async () => {
    remote = { ...remote, status: "cancelled", ended_at: unix("2026-11-24T00:00:00Z") };
    await handleRazorpayWebhook(t.db, cfg, deliver(event("subscription.cancelled", "sub_1"), "evt_3"), fetchLatest);
    // A late "charged" event for the same subscription must not revive it.
    await handleRazorpayWebhook(t.db, cfg, deliver(event("subscription.charged", "sub_1"), "evt_2"), fetchLatest);
    const [row] = await t.db.select().from(subscription).where(eq(subscription.razorpaySubscriptionId, "sub_1"));
    expect(row.status).toBe("cancelled");
    // Paid until 24 Nov, so still Pro until then.
    expect((await getUserPlan(t.db, userId, new Date("2026-11-01T00:00:00Z"))).id).toBe("pro");
    expect((await getUserPlan(t.db, userId, new Date("2026-11-25T00:00:00Z"))).id).toBe("free");
  });

  it("asks Razorpay to retry when the API can't be reached", async () => {
    const failing = async (): Promise<RazorpaySubscription> => {
      throw new Error("timeout");
    };
    const d = deliver(event("subscription.charged", "sub_1"), "evt_4");
    expect((await handleRazorpayWebhook(t.db, cfg, d, failing)).status).toBe(502);
    // Not marked as handled, so the retry is processed.
    expect((await handleRazorpayWebhook(t.db, cfg, d, fetchLatest)).status).toBe(200);
    expect(await t.db.select().from(paymentEvent).where(eq(paymentEvent.eventId, "evt_4"))).toHaveLength(1);
  });

  it("recreates a lost row from the notes, but only for a real user", async () => {
    remote = { ...remote, id: "sub_2", status: "active", ended_at: null };
    await handleRazorpayWebhook(t.db, cfg, deliver(event("subscription.activated", "sub_2"), "evt_5"), fetchLatest);
    const [row] = await t.db.select().from(subscription).where(eq(subscription.razorpaySubscriptionId, "sub_2"));
    expect(row).toMatchObject({ userId, planKey: "monthly", status: "active" });

    remote = { ...remote, id: "sub_3", notes: { userId: "nobody" } };
    await handleRazorpayWebhook(t.db, cfg, deliver(event("subscription.activated", "sub_3"), "evt_6"), fetchLatest);
    expect(await t.db.select().from(subscription).where(eq(subscription.razorpaySubscriptionId, "sub_3"))).toHaveLength(0);
  });

  it("gives Pro users Pro limits and the Pro chain when one is set up", async () => {
    const env = {
      LLM_CHAIN_FREE: "groq", LLM_GROQ_BASE_URL: "https://g", LLM_GROQ_API_KEY: "k", LLM_GROQ_MODEL: "m",
      LLM_CHAIN_PRO: "groq_paid,groq", LLM_GROQ_PAID_BASE_URL: "https://g", LLM_GROQ_PAID_API_KEY: "k2", LLM_GROQ_PAID_MODEL: "m",
    };
    const pro = await aiAccess(t.db, userId, env);
    expect(pro.chain.map((p) => p.name)).toEqual(["groq_paid", "groq"]);
    expect(pro.limits).toMatchObject({ userDaily: 200, chatDaily: 100, globalDaily: Number.POSITIVE_INFINITY });

    const free = await aiAccess(t.db, (await createTestUser(t.db)).id, env);
    expect(free.chain.map((p) => p.name)).toEqual(["groq"]);
    expect(free.limits).toEqual({ userDaily: 50, chatDaily: 10, globalDaily: 1500 });
  });
});
