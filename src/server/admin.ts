import "server-only";
import { notFound } from "next/navigation";
import type { CurrentUser } from "./auth";
import { requireUser } from "./session";

/** Owners who can open /admin, from ADMIN_EMAILS (comma-separated). */
export function adminEmails(env: Record<string, string | undefined> = process.env) {
  return new Set(
    (env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export const isAdmin = (user: Pick<CurrentUser, "email" | "emailVerified">) =>
  user.emailVerified === true && adminEmails().has(user.email.toLowerCase());

/** Everyone else gets a plain 404, so the page's existence isn't advertised. */
export async function requireAdmin() {
  const user = await requireUser();
  if (!isAdmin(user)) notFound();
  return user;
}
