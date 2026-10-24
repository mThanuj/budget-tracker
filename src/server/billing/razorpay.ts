import { createHmac, timingSafeEqual } from "node:crypto";
import type { BillingInterval } from "@/config/plans";

// A thin client for the few Razorpay endpoints we use (no SDK needed).

export type RazorpayConfig = { keyId: string; keySecret: string; webhookSecret: string; plans: Record<BillingInterval, string> };

/** Null when billing isn't set up yet; the app then shows "Pro is coming soon". */
export function razorpayConfig(env: Record<string, string | undefined> = process.env): RazorpayConfig | null {
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
export function verifyCheckoutSignature(input: { paymentId: string; subscriptionId: string; signature: string }, keySecret: string) {
  return sameHex(hmac(keySecret, `${input.paymentId}|${input.subscriptionId}`), input.signature);
}

/** Webhooks: HMAC of the raw, unparsed body with the webhook secret. */
export function verifyWebhookSignature(rawBody: string, signature: string | null, webhookSecret: string) {
  if (!signature || !webhookSecret) return false;
  return sameHex(hmac(webhookSecret, rawBody), signature);
}

export type RazorpaySubscription = {
  id: string;
  plan_id: string;
  status: string;
  current_start: number | null;
  current_end: number | null;
  ended_at: number | null;
  notes?: Record<string, string> | unknown[];
};

async function call<T>(cfg: RazorpayConfig, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
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
  return (await res.json()) as T;
}

export function createSubscription(cfg: RazorpayConfig, interval: BillingInterval, userId: string) {
  return call<RazorpaySubscription>(cfg, "POST", "/subscriptions", {
    plan_id: cfg.plans[interval],
    // Billing cycles until it ends by itself: about 10 years either way.
    total_count: interval === "monthly" ? 120 : 10,
    customer_notify: true,
    notes: { userId, interval },
  });
}

export function fetchSubscription(cfg: RazorpayConfig, id: string) {
  return call<RazorpaySubscription>(cfg, "GET", `/subscriptions/${encodeURIComponent(id)}`);
}

/** Cancels at the end of the paid period, so Pro lasts until then. */
export function cancelSubscriptionAtCycleEnd(cfg: RazorpayConfig, id: string) {
  return call<RazorpaySubscription>(cfg, "POST", `/subscriptions/${encodeURIComponent(id)}/cancel`, { cancel_at_cycle_end: 1 });
}
