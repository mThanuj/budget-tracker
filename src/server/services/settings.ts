import { and, eq, ne, sql } from "drizzle-orm";
import { currencyExponent } from "@/lib/money";
import type { Db } from "../db";
import { budget, goal, recurringRule, transaction, user, wallet } from "../db/schema";
import { UserError } from "./errors";

export const CURRENCY_LOCKED =
  "Your currency was set when you started and can't be changed: your amounts are saved in it.";

const decimals = (n: number) => (n === 0 ? "no decimal places" : n === 1 ? "1 decimal place" : `${n} decimal places`);

/** Whether the user has saved any amount (stored in the currency's smallest unit, so its meaning depends on the currency). */
export async function hasSavedAmounts(db: Db, userId: string): Promise<boolean> {
  const found = await Promise.all([
    db.select({ id: transaction.id }).from(transaction).where(eq(transaction.userId, userId)).limit(1),
    db
      .select({ id: wallet.id })
      .from(wallet)
      .where(and(eq(wallet.userId, userId), ne(wallet.openingBalanceMinor, 0)))
      .limit(1),
    db.select({ id: budget.id }).from(budget).where(eq(budget.userId, userId)).limit(1),
    db.select({ id: goal.id }).from(goal).where(eq(goal.userId, userId)).limit(1),
    db.select({ id: recurringRule.id }).from(recurringRule).where(eq(recurringRule.userId, userId)).limit(1),
  ]);
  return found.some((rows) => rows.length > 0);
}

/**
 * Saves the currency and time zone. Amounts are stored in the currency's
 * smallest unit, so once the account is set up its currency is fixed. While
 * setting up (amounts can be added before /welcome), a currency with a
 * different number of decimals is refused if amounts are already saved.
 * `onboarding` also marks the account as set up.
 */
export async function updatePreferences(
  db: Db,
  userId: string,
  input: { currency: string; timezone: string },
  { onboarding = false } = {},
) {
  const [current] = await db
    .select({ currency: user.currency, onboardedAt: user.onboardedAt })
    .from(user)
    .where(eq(user.id, userId));
  if (current && input.currency !== current.currency) {
    if (current.onboardedAt) throw new UserError(CURRENCY_LOCKED);
    const [wanted, now] = [currencyExponent(input.currency), currencyExponent(current.currency)];
    if (wanted !== now && (await hasSavedAmounts(db, userId))) {
      throw new UserError(
        `${input.currency} has ${decimals(wanted)} and ${current.currency} has ${decimals(now)}, so the amounts you've saved would change. Choose a currency with ${decimals(now)}.`,
      );
    }
  }
  await db
    .update(user)
    .set({ ...input, ...(onboarding && { onboardedAt: sql`coalesce(${user.onboardedAt}, now())` }) })
    .where(eq(user.id, userId));
}
