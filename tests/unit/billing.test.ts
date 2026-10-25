import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { planFromSubscriptions } from "@/server/billing/plan";
import {
  razorpayConfig,
  razorpayKeys,
  razorpaySubscriptionSchema,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from "@/server/billing/razorpay";

const now = new Date("2026-10-24T12:00:00Z");
const later = new Date("2026-11-24T12:00:00Z");
const earlier = new Date("2026-10-01T12:00:00Z");
const sub = (status: string, currentEnd: Date | null = later, cancelAtCycleEnd = false) => ({
  status,
  currentEnd,
  cancelAtCycleEnd,
  planKey: "monthly",
  razorpaySubscriptionId: `sub_${status}`,
});

describe("plan resolution", () => {
  it("is Free with no subscription, or one that was never paid", () => {
    expect(planFromSubscriptions([], now).id).toBe("free");
    expect(planFromSubscriptions([sub("created", null), sub("authenticated", null)], now).id).toBe("free");
  });

  it("is Pro while active, renewing at the period end", () => {
    const plan = planFromSubscriptions([sub("active")], now);
    expect(plan).toMatchObject({ id: "pro", subscription: { renewsAt: later, endsAt: null, paymentProblem: false } });
  });

  it("stays Pro while Razorpay retries a failed charge, and flags it", () => {
    expect(planFromSubscriptions([sub("pending")], now)).toMatchObject({
      id: "pro",
      subscription: { paymentProblem: true },
    });
  });

  it("drops to Free once retries run out", () => {
    expect(planFromSubscriptions([sub("halted")], now).id).toBe("free");
  });

  it("keeps Pro after cancelling until the paid period ends", () => {
    expect(planFromSubscriptions([sub("active", later, true)], now)).toMatchObject({
      id: "pro",
      subscription: { renewsAt: null, endsAt: later },
    });
    expect(planFromSubscriptions([sub("cancelled", later)], now)).toMatchObject({
      id: "pro",
      subscription: { endsAt: later },
    });
    expect(planFromSubscriptions([sub("cancelled", earlier)], now).id).toBe("free");
    expect(planFromSubscriptions([sub("expired", later)], now).id).toBe("free");
  });

  it("stops trusting a live status long after its period ended (missed webhooks)", () => {
    const longAgo = new Date("2026-10-10T12:00:00Z");
    expect(planFromSubscriptions([sub("active", new Date("2026-10-20T12:00:00Z"))], now).id).toBe("pro"); // within a week
    expect(planFromSubscriptions([sub("active", longAgo)], now).id).toBe("free");
    expect(planFromSubscriptions([sub("pending", longAgo)], now).id).toBe("free");
    expect(planFromSubscriptions([sub("active", null)], now).id).toBe("pro");
  });

  it("prefers the live subscription over an old cancelled one", () => {
    const plan = planFromSubscriptions([sub("cancelled", later), sub("active")], now);
    expect(plan.subscription?.razorpaySubscriptionId).toBe("sub_active");
  });
});

describe("Razorpay signatures", () => {
  const secret = "test_key_secret";
  const sign = (msg: string, key = secret) => createHmac("sha256", key).update(msg).digest("hex");

  it("accepts a checkout signature made from the stored subscription id", () => {
    const signature = sign("pay_123|sub_456");
    expect(verifyCheckoutSignature({ paymentId: "pay_123", subscriptionId: "sub_456", signature }, secret)).toBe(true);
    // Same payment, someone else's subscription id: rejected.
    expect(verifyCheckoutSignature({ paymentId: "pay_123", subscriptionId: "sub_999", signature }, secret)).toBe(false);
    expect(verifyCheckoutSignature({ paymentId: "pay_123", subscriptionId: "sub_456", signature: "abc" }, secret)).toBe(
      false,
    );
  });

  it("checks webhooks against the exact raw body", () => {
    const body = '{"event":"subscription.activated"}';
    expect(verifyWebhookSignature(body, sign(body, "whsec"), "whsec")).toBe(true);
    expect(verifyWebhookSignature(`${body} `, sign(body, "whsec"), "whsec")).toBe(false);
    expect(verifyWebhookSignature(body, null, "whsec")).toBe(false);
    expect(verifyWebhookSignature(body, sign(body, ""), "")).toBe(false); // no secret set: never trusted
  });

  it("needs the switch, keys and both plan ids before billing switches on", () => {
    const env = {
      BILLING_ENABLED: "true",
      RAZORPAY_KEY_ID: "rzp_test_1",
      RAZORPAY_KEY_SECRET: "s",
      RAZORPAY_PLAN_MONTHLY: "plan_m",
      RAZORPAY_PLAN_YEARLY: "plan_y",
    };
    expect(razorpayConfig(env)).toMatchObject({ keyId: "rzp_test_1", plans: { monthly: "plan_m", yearly: "plan_y" } });
    expect(razorpayConfig({ ...env, RAZORPAY_PLAN_YEARLY: " " })).toBeNull();
    expect(razorpayConfig({})).toBeNull();
    // Keys alone aren't enough while payments are switched off...
    expect(razorpayConfig({ ...env, BILLING_ENABLED: "false" })).toBeNull();
    expect(razorpayConfig({ ...env, BILLING_ENABLED: undefined })).toBeNull();
    // ...but they can still cancel renewals when someone deletes their account.
    expect(razorpayKeys({ ...env, BILLING_ENABLED: undefined })).toMatchObject({ keyId: "rzp_test_1" });
  });
});

describe("Razorpay responses are checked, not trusted", () => {
  const good = {
    id: "sub_1",
    plan_id: "plan_m",
    status: "active",
    current_start: 1792833694,
    current_end: 1795458600,
    ended_at: null,
    notes: { userId: "u1" },
  };

  it("accepts a real subscription, with [] or missing notes and missing timestamps", () => {
    expect(razorpaySubscriptionSchema.parse(good)).toMatchObject({
      id: "sub_1",
      current_end: 1795458600,
      ended_at: null,
    });
    expect(razorpaySubscriptionSchema.parse({ ...good, notes: [] }).notes).toEqual([]);
    const noEnd: Record<string, unknown> = { ...good };
    delete noEnd.current_end;
    expect(razorpaySubscriptionSchema.parse(noEnd).current_end).toBeNull();
  });

  it("rejects shapes that could grant Pro by mistake", () => {
    expect(razorpaySubscriptionSchema.safeParse({ ...good, status: undefined }).success).toBe(false);
    expect(razorpaySubscriptionSchema.safeParse({ ...good, current_end: "1795458600" }).success).toBe(false);
    expect(razorpaySubscriptionSchema.safeParse({ ...good, id: "" }).success).toBe(false);
    expect(razorpaySubscriptionSchema.safeParse("<html>error</html>").success).toBe(false);
  });
});
