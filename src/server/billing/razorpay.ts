import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { billingEnabled } from "@/config/features";
import type { BillingInterval } from "@/config/plans";

// A thin client for the few Razorpay endpoints we use (no SDK needed).

export type RazorpayConfig = {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  plans: Record<BillingInterval, string>;
};

/** Null unless payments are switched on (BILLING_ENABLED) and the keys are set. */
export function razorpayConfig(env: Record<string, string | undefined> = process.env): RazorpayConfig | null {
  return billingEnabled(env) ? razorpayKeys(env) : null;
}

/** The keys alone, whether or not payments are on (to cancel renewals when an account is deleted). */
export function razorpayKeys(env: Record<string, string | undefined> = process.env): RazorpayConfig | null {
  const keyId = env.RAZORPAY_KEY_ID?.trim();
  const keySecret = env.RAZORPAY_KEY_SECRET?.trim();
  const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET?.trim() ?? "";
  const monthly = env.RAZORPAY_PLAN_MONTHLY?.trim();
  const yearly = env.RAZORPAY_PLAN_YEARLY?.trim();
  if (!keyId || !keySecret || !monthly || !yearly) return null;
  return { keyId, keySecret, webhookSecret, plans: { monthly, yearly } };
}

const sameHex = (a: string, b: string) => {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
};

const hmac = (secret: string, message: string) => createHmac("sha256", secret).update(message).digest("hex");

/** Checkout success: HMAC(payment_id + "|" + the subscription id WE stored, key secret). */
export function verifyCheckoutSignature(
  input: { paymentId: string; subscriptionId: string; signature: string },
  keySecret: string,
) {
  return sameHex(hmac(keySecret, `${input.paymentId}|${input.subscriptionId}`), input.signature);
}

/** Webhooks: HMAC of the raw, unparsed body with the webhook secret. */
export function verifyWebhookSignature(rawBody: string, signature: string | null, webhookSecret: string) {
  if (!signature || !webhookSecret) return false;
  return sameHex(hmac(webhookSecret, rawBody), signature);
}

// Razorpay's answer decides who gets Pro (status, current_end), so it's checked
// rather than trusted. Timestamps are Unix seconds; missing ones become null.
const unixOrNull = z
  .number()
  .int()
  .nonnegative()
  .nullable()
  .optional()
  .transform((v) => v ?? null);
export const razorpaySubscriptionSchema = z.object({
  id: z.string().min(1),
  plan_id: z.string(),
  status: z.string().min(1),
  current_start: unixOrNull,
  current_end: unixOrNull,
  ended_at: unixOrNull,
  // An object of notes, or [] when there are none.
  notes: z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]).optional(),
});
export type RazorpaySubscription = z.infer<typeof razorpaySubscriptionSchema>;

async function call(cfg: RazorpayConfig, method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Razorpay ${method} ${path} failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  return res.json();
}

const subscriptionCall = async (...args: Parameters<typeof call>) =>
  razorpaySubscriptionSchema.parse(await call(...args));

export function createSubscription(cfg: RazorpayConfig, interval: BillingInterval, userId: string) {
  return subscriptionCall(cfg, "POST", "/subscriptions", {
    plan_id: cfg.plans[interval],
    // Billing cycles until it ends by itself: about 10 years either way.
    total_count: interval === "monthly" ? 120 : 10,
    customer_notify: true,
    notes: { userId, interval },
  });
}

export function fetchSubscription(cfg: RazorpayConfig, id: string) {
  return subscriptionCall(cfg, "GET", `/subscriptions/${encodeURIComponent(id)}`);
}

/** Cancels at the end of the paid period, so Pro lasts until then. */
export function cancelSubscriptionAtCycleEnd(cfg: RazorpayConfig, id: string) {
  return subscriptionCall(cfg, "POST", `/subscriptions/${encodeURIComponent(id)}/cancel`, { cancel_at_cycle_end: 1 });
}

/** Cancels straight away (used when an account is deleted). */
export function cancelSubscriptionNow(cfg: RazorpayConfig, id: string) {
  return subscriptionCall(cfg, "POST", `/subscriptions/${encodeURIComponent(id)}/cancel`, { cancel_at_cycle_end: 0 });
}
