import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth, type CurrentUser } from "./auth";

/** The current session, read once per request. */
export const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);

/**
 * Data Access Layer entry point: every page, server action and route handler
 * that touches user data calls this. The proxy's cookie check is only optimistic.
 */
export async function requireUser(): Promise<CurrentUser> {
  const session = await getSession();
  if (!session) redirect("/?signed-out=1");
  return session.user;
}
