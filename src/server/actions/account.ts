"use server";

import { refresh } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { LIMITS } from "@/config/limits";
import { auth } from "@/server/auth";
import { cancelSubscriptionNow, razorpayKeys } from "@/server/billing/razorpay";
import { liveSubscriptions } from "@/server/billing/subscriptions";
import { db } from "@/server/db";
import { deleteAccountData } from "@/server/services/account";
import { getSession, requireUser } from "@/server/session";
import { log } from "@/server/log";
import { currentRequestId } from "@/server/request-id";

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
 * Signs out everywhere else: Better Auth deletes the user's other sessions.
 * Not rate limited, like signOut: someone holding a stolen session could
 * otherwise use up the limit and stop the owner from signing them out (D-035).
 */
export async function signOutOtherDevices(): Promise<{ ok: true }> {
  await requireUser();
  await auth.api.revokeOtherSessions({ headers: await headers() });
  refresh();
  return { ok: true };
}

const signedInRecently = (createdAt: Date | undefined) =>
  createdAt !== undefined && Date.now() - new Date(createdAt).getTime() < LIMITS.freshSignInMinutes * 60_000;

/**
 * Deletes the account and everything in it. Needs a recent Google sign-in.
 * Any Pro renewal is cancelled at Razorpay first; if that fails, nothing is
 * deleted, so no one keeps paying for an account that's gone.
 */
export async function deleteAccount(confirmation: string): Promise<{ ok: false; error: string; signInAgain?: true }> {
  const user = await requireUser();
  // Server actions are public endpoints: the argument may not be a string at all.
  if (typeof confirmation !== "string" || confirmation.trim().toUpperCase() !== "DELETE") {
    return { ok: false, error: "Type DELETE to confirm." };
  }
  // A session left open on a shared computer, or a stolen cookie, mustn't be
  // enough to delete everything (D-035).
  if (!signedInRecently((await getSession())?.session.createdAt)) {
    return { ok: false, error: "For your safety, sign in with Google again, then delete.", signInAgain: true };
  }

  const live = await liveSubscriptions(db, user.id);
  if (live.length > 0) {
    const cfg = razorpayKeys();
    if (!cfg)
      return {
        ok: false,
        error: "Payments are unavailable right now, so your Pro renewal can't be cancelled. Try again later.",
      };
    for (const s of live) {
      try {
        await cancelSubscriptionNow(cfg, s.razorpaySubscriptionId);
      } catch (err) {
        // A checkout that was never paid can't always be cancelled; that's fine.
        if (s.status === "created") continue;
        log.error("account.cancel_before_delete_failed", { err, requestId: await currentRequestId() });
        return {
          ok: false,
          error: "We couldn't cancel your Pro renewal, so nothing was deleted. Try again in a minute.",
        };
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
