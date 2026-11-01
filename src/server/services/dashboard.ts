import { billsLeftThisMonth, daysLeftInMonth } from "@/lib/budgets";
import { addDays, addMonths, type ISODate, monthOf, monthRange, sameDaysLastMonth } from "@/lib/dates";
import type { Db } from "../db";
import { buildAlerts, buildRecurringAlerts, withoutDismissed } from "./alerts";
import { getBudgetOverview } from "./budgets";
import { listGoals } from "./goals";
import { awaitingFrom, listRules, upcomingFrom } from "./recurring";
import { monthlyTotals, spendingByCategory } from "./reports";
import { listTransactions, summarizeTransactions } from "./transactions";
import { listWallets } from "./wallets";

/**
 * Everything the home page shows, in as few queries as it takes: the recurring
 * items are read once (upcoming and waiting come from that), and this month's
 * totals come from the six-month chart's figures. The page runs the recurring
 * catch-up (syncRecurring) first, so balances include what it records.
 */
export async function loadDashboard(db: Db, userId: string, { today, currency }: { today: ISODate; currency: string }) {
  const month = monthOf(today);
  const { start, end } = monthRange(month);
  // Compare with the same stretch of last month, not all of it.
  const lastMonthSameDays = sameDaysLastMonth(today);

  const [overview, goals, wallets, byCategory, totals, recent, lastMonthSoFar, rules] = await Promise.all([
    getBudgetOverview(db, userId, month),
    listGoals(db, userId),
    listWallets(db, userId),
    spendingByCategory(db, userId, start, end),
    monthlyTotals(db, userId, addMonths(month, -5), month),
    listTransactions(db, userId, {}, 5),
    summarizeTransactions(db, userId, { from: lastMonthSameDays.start, to: lastMonthSameDays.end }),
    listRules(db, userId),
  ]);
  const thisMonth = totals.at(-1) ?? { month, incomeMinor: 0, expenseMinor: 0 };
  // Bills to the end of the month for "safe to spend"; the "Coming up" card shows two weeks.
  const billsAhead = upcomingFrom(rules, today, Math.max(14, daysLeftInMonth(month, today) ?? 0));
  const upcoming = billsAhead.filter((u) => u.date <= addDays(today, 14));
  const waiting = awaitingFrom(rules, today);
  const alerts = await withoutDismissed(db, userId, [
    ...buildAlerts({ overview, goals, month, today, currency }),
    ...buildRecurringAlerts({ upcoming, rules, today, currency }),
  ]);

  return {
    month,
    overview,
    goals,
    wallets,
    byCategory,
    totals,
    recent,
    thisMonth,
    lastMonthSoFar,
    upcoming,
    waiting,
    billsLeft: billsLeftThisMonth(month, billsAhead, waiting),
    alerts,
  };
}
