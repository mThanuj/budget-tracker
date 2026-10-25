"use server";

import { and, eq, inArray } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { cancelSubscriptionNow, razorpayKeys } from "@/server/billing/razorpay";
import { db } from "@/server/db";
import { subscription } from "@/server/db/schema";
import { deleteAccountData } from "@/server/services/account";
import { requireUser } from "@/server/session";

/**
 * Ends this session on the server and clears its cookies (Better Auth's
 * nextCookies plugin), then goes to the landing page. A server action rather
 * than Better Auth's browser client, which would otherwise be loaded on every
 * signed-in page just for this button.
 */
export async function signOut(): Promise<never> {
  await requireUser();
  await auth.api.signOut({ headers: await headers() });
  redirect("/");
}

/**
 * Deletes the account and everything in it. Any Pro renewal is cancelled at
 * Razorpay first; if that fails, nothing is deleted, so no one keeps paying
 * for an account that's gone.
 */
export async function deleteAccount(confirmation: string): Promise<{ ok: false; error: string }> {
  const user = await requireUser();
  // Server actions are public endpoints: the argument may not be a string at all.
  if (typeof confirmation !== "string" || confirmation.trim().toUpperCase() !== "DELETE") {
    return { ok: false, error: "Type DELETE to confirm." };
  }

  const live = await db
    .select()
    .from(subscription)
    .where(and(eq(subscription.userId, user.id), inArray(subscription.status, ["created", "authenticated", "active", "pending", "paused"])));
  if (live.length > 0) {
    const cfg = razorpayKeys();
    if (!cfg) return { ok: false, error: "Payments are unavailable right now, so your Pro renewal can't be cancelled. Try again later." };
    for (const s of live) {
      try {
        await cancelSubscriptionNow(cfg, s.razorpaySubscriptionId);
      } catch (err) {
        // A checkout that was never paid can't always be cancelled; that's fine.
        if (s.status === "created") continue;
        console.error("[account] couldn't cancel subscription before deleting:", err instanceof Error ? err.message : err);
        return { ok: false, error: "We couldn't cancel your Pro renewal, so nothing was deleted. Try again in a minute." };
      }
    }
  }

  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // The session goes with the user row anyway.
  }
  await deleteAccountData(db, user.id);
  // Make sure no sign-in cookie outlives the account.
  const jar = await cookies();
  for (const c of jar.getAll()) if (c.name.includes("better-auth.")) jar.delete(c.name);
  redirect("/?deleted=1");
}
