import "server-only";
import { todayInTz } from "@/lib/dates";
import type { CurrentUser } from "./auth";
import { db } from "./db";
import { recordDueForUser } from "./services/recurring";

/**
 * Records the user's automatic recurring entries that came due, so pages show
 * up-to-date balances even if the hourly job hasn't run yet. Idempotent.
 */
export async function syncRecurring(user: CurrentUser) {
  await recordDueForUser(db, user.id, todayInTz(user.timezone ?? "Asia/Kolkata"));
}
