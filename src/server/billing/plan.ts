import { eq } from "drizzle-orm";
import { billingEnabled } from "@/config/features";
import { PLANS, type PlanId } from "@/config/plans";
import type { Db } from "../db";
import { subscription } from "../db/schema";

type SubscriptionRow = Pick<typeof subscription.$inferSelect, "status" | "currentEnd" | "planKey" | "cancelAtCycleEnd" | "razorpaySubscriptionId">;

const STALE_AFTER_MS = 7 * 86_400_000;

/**
 * "Active" a week past its period end means we missed Razorpay's news (lost
 * webhooks), so it stops counting until a sync with Razorpay confirms it.
 */
export function isStale(s: Pick<SubscriptionRow, "status" | "currentEnd">, now: Date = new Date()) {
  return (s.status === "active" || s.status === "pending") && s.currentEnd !== null && s.currentEnd.getTime() < now.getTime() - STALE_AFTER_MS;
}

/**
 * Pro while a subscription is active or Razorpay is still retrying a failed
 * charge ("pending"), and after cancelling until the paid period ends.
 * Halted (retries exhausted), expired and never-paid subscriptions are Free.
 */
export function planFromSubscriptions(subs: SubscriptionRow[], now: Date = new Date()) {
  const paidUntil = (s: SubscriptionRow) => (s.currentEnd && s.currentEnd > now ? s.currentEnd : null);
  const current =
    subs.find((s) => (s.status === "active" || s.status === "pending") && !isStale(s, now)) ??
    subs.find((s) => (s.status === "cancelled" || s.status === "completed") && paidUntil(s));
  if (!current) return { id: "free" as PlanId, subscription: null };
  const endingAt = current.status === "cancelled" || current.status === "completed" || current.cancelAtCycleEnd ? current.currentEnd : null;
  return {
    id: "pro" as PlanId,
    subscription: {
      razorpaySubscriptionId: current.razorpaySubscriptionId,
      interval: current.planKey,
      status: current.status,
      renewsAt: endingAt ? null : current.currentEnd,
      endsAt: endingAt,
      paymentProblem: current.status === "pending",
    },
  };
}

export async function getUserPlan(db: Db, userId: string, now: Date = new Date(), env: Record<string, string | undefined> = process.env) {
  // With payments switched off, everyone is on Free.
  if (!billingEnabled(env)) return { id: "free" as PlanId, subscription: null, limits: PLANS.free };
  const subs = await db.select().from(subscription).where(eq(subscription.userId, userId));
  const plan = planFromSubscriptions(subs, now);
  return { ...plan, limits: PLANS[plan.id] };
}

