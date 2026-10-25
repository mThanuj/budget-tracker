"use server";

import { and, desc, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { priceLabel } from "@/config/plans";
import { getUserPlan } from "@/server/billing/plan";
import {
  cancelSubscriptionAtCycleEnd,
  createSubscription,
  fetchSubscription,
  razorpayConfig,
  verifyCheckoutSignature,
} from "@/server/billing/razorpay";
import {
  isConfirming,
  saveSubscriptionState,
  subscriptionsToSync,
  unsettledSubscriptions,
} from "@/server/billing/subscriptions";
import { db } from "@/server/db";
import { subscription } from "@/server/db/schema";
import { requireUser } from "@/server/session";

const NOT_SET_UP = "Pro isn't available yet. Please check back soon.";
const TRY_AGAIN = "We couldn't reach the payment service. Try again in a minute.";

export type CheckoutStart =
  | { ok: true; keyId: string; subscriptionId: string; description: string; prefill: { name: string; email: string } }
  | { ok: false; error: string };

/** Creates (or reuses) a Razorpay subscription for Checkout to open. */
export async function startCheckout(interval: "monthly" | "yearly"): Promise<CheckoutStart> {
  const user = await requireUser();
  const cfg = razorpayConfig();
  if (!cfg) return { ok: false, error: NOT_SET_UP };
  const chosen = z.enum(["monthly", "yearly"]).safeParse(interval);
  if (!chosen.success) return { ok: false, error: "Choose monthly or yearly." };

  try {
    // An earlier checkout may have gone through, or a renewal, without us hearing back.
    for (const row of await subscriptionsToSync(db, user.id)) {
      await saveSubscriptionState(db, await fetchSubscription(cfg, row.razorpaySubscriptionId), cfg);
    }
    if ((await getUserPlan(db, user.id)).id === "pro") return { ok: false, error: "You already have Pro." };
    // A payment Razorpay is still confirming: a second checkout could charge twice.
    if ((await unsettledSubscriptions(db, user.id)).some((s) => isConfirming(s))) {
      return {
        ok: false,
        error: "Your last payment is still being confirmed. Pro should switch on in a minute or two.",
      };
    }

    const [reusable] = await db
      .select()
      .from(subscription)
      .where(
        and(
          eq(subscription.userId, user.id),
          eq(subscription.planKey, chosen.data),
          eq(subscription.status, "created"),
        ),
      )
      .orderBy(desc(subscription.createdAt))
      .limit(1);
    let subscriptionId = reusable?.razorpaySubscriptionId;
    if (!subscriptionId) {
      const created = await createSubscription(cfg, chosen.data, user.id);
      await db.insert(subscription).values({
        userId: user.id,
        razorpaySubscriptionId: created.id,
        planKey: chosen.data,
        status: created.status,
      });
      subscriptionId = created.id;
    }
    return {
      ok: true,
      keyId: cfg.keyId,
      subscriptionId,
      description: `Pro · ${priceLabel(chosen.data)}`,
      prefill: { name: user.name, email: user.email },
    };
  } catch (err) {
    console.error("[billing] start checkout failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: TRY_AGAIN };
  }
}

const checkoutResponse = z.object({
  razorpay_payment_id: z.string().min(1).max(100),
  razorpay_subscription_id: z.string().min(1).max(100),
  razorpay_signature: z.string().regex(/^[0-9a-f]{64}$/),
});

export type CheckoutConfirm = { ok: true; active: boolean } | { ok: false; error: string };

/** Called by Checkout's success handler. The webhook confirms the same thing in production. */
export async function confirmCheckout(response: unknown): Promise<CheckoutConfirm> {
  const user = await requireUser();
  const cfg = razorpayConfig();
  if (!cfg) return { ok: false, error: NOT_SET_UP };
  const input = checkoutResponse.safeParse(response);
  if (!input.success) return { ok: false, error: "That payment response looks incomplete." };

  // Only a subscription we created for this user counts; its id is the one we stored.
  const [row] = await db
    .select()
    .from(subscription)
    .where(
      and(
        eq(subscription.userId, user.id),
        eq(subscription.razorpaySubscriptionId, input.data.razorpay_subscription_id),
      ),
    );
  const signed =
    row &&
    verifyCheckoutSignature(
      {
        paymentId: input.data.razorpay_payment_id,
        subscriptionId: row.razorpaySubscriptionId,
        signature: input.data.razorpay_signature,
      },
      cfg.keySecret,
    );
  if (!signed) {
    return {
      ok: false,
      error: "We couldn't confirm that payment. If money was taken, Pro will switch on here within a few minutes.",
    };
  }

  try {
    const latest = await fetchSubscription(cfg, row.razorpaySubscriptionId);
    // The payment is verified, so it's at least authenticated even if Razorpay hasn't caught up.
    await saveSubscriptionState(db, latest.status === "created" ? { ...latest, status: "authenticated" } : latest, cfg);
  } catch (err) {
    console.error("[billing] confirm fetch failed:", err instanceof Error ? err.message : err);
    // Only move forward: never overwrite a state Razorpay already confirmed.
    if (row.status === "created")
      await db.update(subscription).set({ status: "authenticated" }).where(eq(subscription.id, row.id));
  }
  refresh();
  return { ok: true, active: (await getUserPlan(db, user.id)).id === "pro" };
}

/** Re-checks payments still being confirmed. Returns true once Pro is on. */
export async function checkPaymentStatus(): Promise<boolean> {
  const user = await requireUser();
  const cfg = razorpayConfig();
  if (!cfg) return false;
  try {
    for (const row of await unsettledSubscriptions(db, user.id)) {
      if (row.status === "authenticated")
        await saveSubscriptionState(db, await fetchSubscription(cfg, row.razorpaySubscriptionId), cfg);
    }
  } catch (err) {
    console.error("[billing] status check failed:", err instanceof Error ? err.message : err);
  }
  const pro = (await getUserPlan(db, user.id)).id === "pro";
  if (pro) refresh();
  return pro;
}

/** Cancels at the end of the paid period; Pro stays until then. */
export async function cancelPro(): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const cfg = razorpayConfig();
  if (!cfg) return { ok: false, error: NOT_SET_UP };
  const plan = await getUserPlan(db, user.id);
  if (!plan.subscription || plan.subscription.endsAt) return { ok: false, error: "There's no renewal to cancel." };

  try {
    const latest = await cancelSubscriptionAtCycleEnd(cfg, plan.subscription.razorpaySubscriptionId);
    await saveSubscriptionState(db, latest, cfg);
  } catch (err) {
    console.error("[billing] cancel failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: TRY_AGAIN };
  }
  await db
    .update(subscription)
    .set({ cancelAtCycleEnd: true })
    .where(
      and(
        eq(subscription.userId, user.id),
        eq(subscription.razorpaySubscriptionId, plan.subscription.razorpaySubscriptionId),
      ),
    );
  refresh();
  return { ok: true };
}
