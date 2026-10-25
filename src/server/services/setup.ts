import { and, eq, isNull, sql } from "drizzle-orm";
import { addMonths, type ISODate } from "@/lib/dates";
import type { SetupInput } from "@/lib/validation";
import { DEFAULT_WALLET_COLOR } from "@/lib/wallets";
import type { Db } from "../db";
import { budget, user, wallet } from "../db/schema";
import { createBudget, updateBudget } from "./budgets";
import { listCategories } from "./categories";
import { UserError } from "./errors";
import { createGoal } from "./goals";
import { createRule } from "./recurring";
import { listWallets } from "./wallets";

function daysInMonth(month: string) {
  return new Date(Date.parse(`${addMonths(month, 1)}-01T00:00:00Z`) - 86_400_000).getUTCDate();
}

/**
 * First date for a monthly item, always after today, so applying the setup
 * never records anything on the spot (the user may have paid already).
 * No day given: same day next month.
 */
export function firstMonthlyDate(day: number | null, today: ISODate): ISODate {
  const todayDay = Number(today.slice(8, 10));
  const wanted = day ?? todayDay;
  const month = wanted > todayDay && wanted <= daysInMonth(today.slice(0, 7)) ? today.slice(0, 7) : addMonths(today.slice(0, 7), 1);
  return `${month}-${String(Math.min(wanted, daysInMonth(month))).padStart(2, "0")}`;
}

const incomeCategoryName = (name: string) =>
  /salary|stipend|wage/i.test(name) ? "Salary" : /freelanc|client|project/i.test(name) ? "Freelance" : /rent/i.test(name) ? "Other Income" : null;

/** Creates everything the user reviewed, in one transaction: all of it or none of it. */
export async function applySetup(db: Db, userId: string, input: SetupInput, today: ISODate) {
  return db.transaction(async (tx) => {
    const existing = await listWallets(tx, userId, { includeArchived: true });
    const byName = new Map(existing.map((w) => [w.name.toLowerCase(), { id: w.id, archived: w.archivedAt !== null }]));
    const counts = { wallets: 0, recurring: 0, budgets: 0, goals: 0 };

    for (const w of input.wallets) {
      const opening = w.kind === "credit_card" ? -w.balance : w.balance;
      const match = existing.find((e) => e.name.toLowerCase() === w.name.toLowerCase());
      if (match) {
        // e.g. the default Cash wallet: fill in its balance if it's still untouched.
        if (!match.archivedAt && match.entryCount === 0 && match.openingBalanceMinor === 0 && opening !== 0) {
          await tx.update(wallet).set({ openingBalanceMinor: opening }).where(eq(wallet.id, match.id));
        }
        continue;
      }
      const created = await tx
        .insert(wallet)
        .values({ userId, name: w.name, kind: w.kind, color: DEFAULT_WALLET_COLOR[w.kind], openingBalanceMinor: opening })
        .onConflictDoNothing()
        .returning({ id: wallet.id });
      if (created[0]) {
        byName.set(w.name.toLowerCase(), { id: created[0].id, archived: false });
        counts.wallets++;
      }
    }
    // The first wallet becomes the default if the user had none.
    const [{ defaultWalletId }] = await tx.select({ defaultWalletId: user.defaultWalletId }).from(user).where(eq(user.id, userId));
    const active = [...byName.values()].filter((w) => !w.archived);
    if (!defaultWalletId && active[0]) await tx.update(user).set({ defaultWalletId: active[0].id }).where(eq(user.id, userId));

    const walletFor = (name: string) => {
      const found = byName.get(name.toLowerCase());
      if (found && !found.archived) return found.id;
      const fallback = defaultWalletId ?? active[0]?.id;
      if (!fallback) throw new UserError("Add at least one wallet first.");
      return fallback;
    };

    const categories = await listCategories(tx, userId);
    const categoryNamed = (name: string, kind: "income" | "expense") =>
      categories.find((c) => c.kind === kind && c.name === name)?.id ?? null;

    for (const i of input.incomes) {
      const categoryName = incomeCategoryName(i.name);
      await createRule(
        tx,
        userId,
        {
          type: "income", amount: i.amount, description: i.name, walletId: walletFor(input.incomeWallet), toWalletId: null,
          categoryId: categoryName ? categoryNamed(categoryName, "income") : null,
          frequency: "monthly", interval: 1, anchorDate: firstMonthlyDate(i.day, today), endDate: null,
          mode: "auto", isSubscription: false,
        },
        today,
      );
      counts.recurring++;
    }
    for (const b of input.bills) {
      await createRule(
        tx,
        userId,
        {
          type: "expense", amount: b.amount, description: b.name, walletId: walletFor(input.billsWallet), toWalletId: null,
          categoryId: b.categoryId ?? (b.subscription ? categoryNamed("Subscriptions", "expense") : null),
          frequency: "monthly", interval: 1, anchorDate: firstMonthlyDate(b.day, today), endDate: null,
          mode: "auto", isSubscription: b.subscription,
        },
        today,
      );
      counts.recurring++;
    }

    const month = today.slice(0, 7);
    if (input.limit > 0) {
      const [overall] = await tx
        .select({ id: budget.id, rollover: budget.rollover })
        .from(budget)
        .where(and(eq(budget.userId, userId), isNull(budget.categoryId)));
      if (overall) await updateBudget(tx, userId, overall.id, { amount: input.limit, rollover: false }, month);
      else await createBudget(tx, userId, { categoryId: null, amount: input.limit, rollover: false }, month);
      counts.budgets++;
    }
    for (const cb of input.categoryBudgets) {
      const [taken] = await tx
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(budget)
        .where(and(eq(budget.userId, userId), eq(budget.categoryId, cb.categoryId)));
      if (taken.n > 0) continue; // keep the user's own budget
      await createBudget(tx, userId, { categoryId: cb.categoryId, amount: cb.amount, rollover: false }, month);
      counts.budgets++;
    }

    for (const g of input.goals) {
      await createGoal(tx, userId, { name: g.name, target: g.target, targetDate: g.by, icon: "piggy-bank", color: "#4a7fc1" });
      counts.goals++;
    }

    await tx
      .update(user)
      .set({ onboardedAt: sql`coalesce(${user.onboardedAt}, now())` })
      .where(eq(user.id, userId));
    return counts;
  });
}
