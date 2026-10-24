import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { BillingInterval } from "@/config/plans";
import type { Db } from "../db";
import { isStale } from "./plan";
import { paymentEvent, subscription, user } from "../db/schema";
import { type RazorpayConfig, type RazorpaySubscription, verifyWebhookSignature } from "./razorpay";

const fromUnix = (s: number | null | undefined) => (s ? new Date(s * 1000) : null);

/** Razorpay sends notes as an object, or as [] when there are none. */
const notesOf = (s: RazorpaySubscription): Record<string, string> =>
  s.notes && !Array.isArray(s.notes) ? (s.notes as Record<string, string>) : {};

function intervalOf(s: RazorpaySubscription, cfg: RazorpayConfig): BillingInterval | null {
  if (s.plan_id === cfg.plans.monthly) return "monthly";
  if (s.plan_id === cfg.plans.yearly) return "yearly";
  const note = notesOf(s).interval;
  return note === "monthly" || note === "yearly" ? note : null;
}

/**
 * Stores Razorpay's current view of a subscription. Rows are created when
 * checkout starts; if that insert was lost, the userId we put in the notes
 * (only our server can set them) recreates it.
 */
export async function saveSubscriptionState(db: Db, s: RazorpaySubscription, cfg: RazorpayConfig) {
  const values = {
    status: s.status,
    currentStart: fromUnix(s.current_start),
    currentEnd: fromUnix(s.current_end),
    endedAt: fromUnix(s.ended_at),
  };
  const updated = await db
    .update(subscription)
    .set(values)
    .where(eq(subscription.razorpaySubscriptionId, s.id))
    .returning({ id: subscription.id });
  if (updated.length > 0) return true;

  const userId = notesOf(s).userId;
  const planKey = intervalOf(s, cfg);
  if (!userId || !planKey) return false;
  const [owner] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId));
  if (!owner) return false;
  await db
    .insert(subscription)
    .values({ userId, razorpaySubscriptionId: s.id, planKey, ...values })
    .onConflictDoUpdate({ target: subscription.razorpaySubscriptionId, set: values });
  return true;
}

type WebhookEvent = { event?: string; payload?: { subscription?: { entity?: { id?: string } } } };

/**
 * Handles one webhook delivery. Razorpay may send events twice or out of
 * order, so instead of trusting the payload we fetch the subscription's
 * latest state and store that. Failing to fetch returns 502 so Razorpay retries.
 */
export async function handleRazorpayWebhook(
  db: Db,
  cfg: RazorpayConfig,
  input: { rawBody: string; signature: string | null; eventId: string | null },
  fetchLatest: (id: string) => Promise<RazorpaySubscription>,
): Promise<{ status: number; body: string }> {
  if (!verifyWebhookSignature(input.rawBody, input.signature, cfg.webhookSecret)) return { status: 400, body: "Bad signature" };
  let event: WebhookEvent;
  try {
    event = JSON.parse(input.rawBody) as WebhookEvent;
  } catch {
    return { status: 400, body: "Bad JSON" };
  }
  const eventId = input.eventId?.trim() || createHash("sha256").update(input.rawBody).digest("hex");
  const [seen] = await db.select().from(paymentEvent).where(eq(paymentEvent.eventId, eventId));
  if (seen) return { status: 200, body: "Already handled" };

  const subId = event.payload?.subscription?.entity?.id;
  if (event.event?.startsWith("subscription.") && subId) {
    let latest: RazorpaySubscription;
    try {
      latest = await fetchLatest(subId);
    } catch (err) {
      console.error("[billing] couldn't fetch subscription for webhook:", err instanceof Error ? err.message : err);
      return { status: 502, body: "Try again" };
    }
    if (!(await saveSubscriptionState(db, latest, cfg))) console.warn(`[billing] webhook for unknown subscription ${subId}`);
  }
  await db.insert(paymentEvent).values({ eventId, eventType: event.event ?? "unknown" }).onConflictDoNothing();
  return { status: 200, body: "OK" };
}

/** Subscriptions still waiting on payment or on Razorpay's first charge. */
export function unsettledSubscriptions(db: Db, userId: string) {
  return db
    .select()
    .from(subscription)
    .where(and(eq(subscription.userId, userId), inArray(subscription.status, ["created", "authenticated"])));
}

/** Ones to re-check with Razorpay before a new checkout: unsettled, or live but long past their period. */
export async function subscriptionsToSync(db: Db, userId: string, now = new Date()) {
  const rows = await db
    .select()
    .from(subscription)
    .where(and(eq(subscription.userId, userId), inArray(subscription.status, ["created", "authenticated", "active", "pending"])));
  return rows.filter((s) => s.status === "created" || s.status === "authenticated" || isStale(s, now));
}

/**
 * Paid, with Razorpay still confirming the first charge. After an hour without
 * news it no longer blocks a new checkout (the webhook settles it either way).
 */
export const isConfirming = (s: { status: string; updatedAt: Date }, now = Date.now()) =>
  s.status === "authenticated" && s.updatedAt.getTime() > now - 60 * 60_000;
