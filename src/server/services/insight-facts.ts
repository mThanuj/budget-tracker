import { createHash } from "node:crypto";
import { tz } from "@date-fns/tz";
import { format } from "date-fns";
import { aliasedTable, and, asc, count, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { formatMonth } from "@/lib/date-format";
import { addDays, addMonths, type ISODate, type ISOMonth, monthOf, monthRange, sameDaysLastMonth } from "@/lib/dates";
import { goalProgress } from "@/lib/goals";
import type { InsightFacts, InsightKind } from "@/lib/insights";
import { currencyExponent, formatMoney } from "@/lib/money";
import type { Db } from "../db";
import { category, goal, goalContribution, recurringRule, transaction } from "../db/schema";
import { getBudgetOverview } from "./budgets";
import { listUpcoming } from "./recurring";
import { monthlyTotals, spendingByCategory } from "./reports";

const utc = tz("UTC");
const shortDate = (d: ISODate) => format(new Date(`${d}T00:00:00Z`), "d MMM", { in: utc });
const pct = (part: number, whole: number) => `${Math.round((part / whole) * 100)}%`;

/** "12% more", "8% less", "about the same", or a note when there's nothing to compare with. */
function change(now: number, before: number) {
  if (before <= 0) return now > 0 ? "nothing before to compare" : "none either time";
  const d = Math.round(((now - before) / before) * 100);
  if (Math.abs(d) < 5) return "about the same";
  return d > 0 ? `${d}% more` : `${-d}% less`;
}

type Span = { from: ISODate; to: ISODate }; // end exclusive

/**
 * The facts for a finished month, or for the current month up to today
 * ("so far", compared with the same days of last month).
 */
export async function buildInsightFacts(
  db: Db,
  userId: string,
  { kind, month, today, currency }: { kind: InsightKind; month: ISOMonth; today: ISODate; currency: string },
): Promise<InsightFacts> {
  const money = (minor: number) => formatMoney(minor, currency, { trimWhole: true });
  const prevMonth = addMonths(month, -1);
  const full = monthRange(month);
  const daysInMonth = Number(addDays(full.end, -1).slice(8, 10));
  const day = kind === "so_far" ? Number(today.slice(8, 10)) : daysInMonth;
  const span: Span =
    kind === "so_far" ? { from: full.start, to: addDays(today, 1) } : { from: full.start, to: full.end };
  const prevFull = monthRange(prevMonth);
  const sameDays = sameDaysLastMonth(today);
  const before: Span =
    kind === "so_far" ? { from: sameDays.start, to: sameDays.end } : { from: prevFull.start, to: prevFull.end };
  const inSpan = (s: Span) => and(gte(transaction.occurredOn, s.from), lt(transaction.occurredOn, s.to));
  const mine = eq(transaction.userId, userId);

  const totals = (s: Span) =>
    db
      .select({
        entries: count(),
        income:
          sql<number>`coalesce(sum(${transaction.amountMinor}) filter (where ${transaction.type} = 'income'), 0)`.mapWith(
            Number,
          ),
        spending:
          sql<number>`coalesce(sum(${transaction.amountMinor}) filter (where ${transaction.type} = 'expense'), 0)`.mapWith(
            Number,
          ),
        recurringSpending:
          sql<number>`coalesce(sum(${transaction.amountMinor}) filter (where ${transaction.type} = 'expense' and ${transaction.recurringRuleId} is not null), 0)`.mapWith(
            Number,
          ),
        uncategorized:
          sql<number>`count(*) filter (where ${transaction.type} = 'expense' and ${transaction.categoryId} is null)`.mapWith(
            Number,
          ),
      })
      .from(transaction)
      .where(and(mine, inSpan(s), sql`${transaction.type} <> 'transfer'`))
      .then((r) => r[0]);

  const twin = aliasedTable(transaction, "twin");
  const [now, then, cats, prevCats, history, overview, biggest, dupes, subs, charges, goals] = await Promise.all([
    totals(span),
    totals(before),
    spendingByCategory(db, userId, span.from, span.to),
    spendingByCategory(db, userId, before.from, before.to),
    kind === "month" ? monthlyTotals(db, userId, addMonths(month, -3), prevMonth) : Promise.resolve([]),
    getBudgetOverview(db, userId, month),
    db
      .select({
        description: transaction.description,
        amountMinor: transaction.amountMinor,
        occurredOn: transaction.occurredOn,
        category: category.name,
      })
      .from(transaction)
      .leftJoin(category, eq(category.id, transaction.categoryId))
      .where(and(mine, inSpan(span), eq(transaction.type, "expense")))
      .orderBy(desc(transaction.amountMinor), asc(transaction.occurredOn))
      .limit(3),
    // Same merchant and amount within two days, not from a schedule: often a double charge.
    db
      .select({
        description: transaction.description,
        amountMinor: transaction.amountMinor,
        first: transaction.occurredOn,
        second: twin.occurredOn,
      })
      .from(transaction)
      .innerJoin(
        twin,
        and(
          eq(twin.userId, transaction.userId),
          eq(twin.type, transaction.type),
          eq(twin.merchantKey, transaction.merchantKey),
          eq(twin.amountMinor, transaction.amountMinor),
          isNull(twin.recurringRuleId),
          sql`${twin.occurredOn} between ${transaction.occurredOn} and ${transaction.occurredOn} + 2`,
          sql`(${twin.occurredOn} > ${transaction.occurredOn} or ${twin.id} > ${transaction.id})`,
        ),
      )
      .where(and(mine, inSpan(span), eq(transaction.type, "expense"), isNull(transaction.recurringRuleId)))
      .orderBy(asc(transaction.occurredOn))
      .limit(3),
    db
      .select({
        rules: sql<number>`count(distinct ${transaction.recurringRuleId})`.mapWith(Number),
        spent: sql<number>`coalesce(sum(${transaction.amountMinor}), 0)`.mapWith(Number),
      })
      .from(transaction)
      .innerJoin(recurringRule, eq(recurringRule.id, transaction.recurringRuleId))
      .where(and(mine, inSpan(span), eq(transaction.type, "expense"), eq(recurringRule.isSubscription, true)))
      .then((r) => r[0]),
    // Each subscription charge next to the one before it, up to the end of the period.
    db
      .select({
        name: recurringRule.description,
        occurredOn: transaction.occurredOn,
        amountMinor: transaction.amountMinor,
        previousMinor: sql<
          number | null
        >`lag(${transaction.amountMinor}) over (partition by ${transaction.recurringRuleId} order by ${transaction.occurredOn}, ${transaction.createdAt})`.mapWith(
          (v) => (v === null ? null : Number(v)),
        ),
      })
      .from(transaction)
      .innerJoin(recurringRule, eq(recurringRule.id, transaction.recurringRuleId))
      .where(
        and(
          mine,
          lt(transaction.occurredOn, span.to),
          eq(transaction.type, "expense"),
          eq(recurringRule.isSubscription, true),
        ),
      ),
    db
      .select({
        name: goal.name,
        createdAt: goal.createdAt,
        targetMinor: goal.targetMinor,
        targetDate: goal.targetDate,
        savedMinor:
          sql<number>`coalesce(sum(${goalContribution.amountMinor}) filter (where ${goalContribution.occurredOn} < ${span.to}), 0)`.mapWith(
            Number,
          ),
        addedMinor:
          sql<number>`coalesce(sum(${goalContribution.amountMinor}) filter (where ${goalContribution.occurredOn} >= ${span.from} and ${goalContribution.occurredOn} < ${span.to}), 0)`.mapWith(
            Number,
          ),
      })
      .from(goal)
      .leftJoin(goalContribution, eq(goalContribution.goalId, goal.id))
      .where(and(eq(goal.userId, userId), isNull(goal.archivedAt)))
      .groupBy(goal.id)
      .orderBy(asc(goal.createdAt)),
  ]);

  const pastMonths = history.filter((m) => m.expenseMinor > 0);
  const prevByCat = new Map(prevCats.map((c) => [c.categoryId, c.spentMinor]));
  const kept = now.income - now.spending;

  let overallLimit: InsightFacts["overallLimit"] = null;
  if (overview.overall) {
    const o = overview.overall;
    let projectedMonthEnd: string | null = null;
    let projectedOverLimit = false;
    // Day-to-day spending at its current pace, plus scheduled bills still to come.
    if (kind === "so_far" && day >= 7 && day < daysInMonth) {
      const upcoming = await listUpcoming(db, userId, today, daysInMonth - day);
      const billsLeft = upcoming
        .filter((u) => u.rule.type === "expense" && monthOf(u.date) === month)
        .reduce((s, u) => s + u.rule.amountMinor, 0);
      const dayToDay = now.spending - now.recurringSpending;
      const projected = now.spending + (dayToDay / day) * (daysInMonth - day) + billsLeft;
      const unit = 100 * 10 ** currencyExponent(currency);
      projectedMonthEnd = `about ${money(Math.round(projected / unit) * unit)}`;
      projectedOverLimit = o.remainingMinor >= 0 && projected > o.availableMinor;
    }
    overallLimit = {
      limit: money(o.availableMinor),
      spent: money(o.spentMinor),
      used: o.availableMinor > 0 ? pct(o.spentMinor, o.availableMinor) : "100%",
      left: o.remainingMinor >= 0 ? money(o.remainingMinor) : null,
      over: o.remainingMinor < 0 ? money(-o.remainingMinor) : null,
      projectedMonthEnd,
      projectedOverLimit,
    };
  }

  const asOf = addDays(span.to, -1);
  const priceChanges = charges
    .filter((c) => c.occurredOn >= span.from && c.previousMinor !== null && c.previousMinor !== c.amountMinor)
    .map((c) => ({ name: c.name, from: money(c.previousMinor!), to: money(c.amountMinor) }));

  return {
    kind,
    period: kind === "so_far" ? `1–${day} ${formatMonth(month)}` : formatMonth(month),
    dayOfMonth: kind === "so_far" ? { day, daysInMonth } : null,
    entries: now.entries,
    income: money(now.income),
    spending: money(now.spending),
    kept: now.income > 0 && kept >= 0 ? { amount: money(kept), shareOfIncome: pct(kept, now.income) } : null,
    spentMoreThanIncomeBy: now.income > 0 && kept < 0 ? money(-kept) : null,
    noIncomeRecorded: now.income === 0,
    comparedWith:
      then.entries > 0
        ? {
            period:
              kind === "so_far"
                ? `1–${Number(addDays(before.to, -1).slice(8, 10))} ${formatMonth(prevMonth)}`
                : formatMonth(prevMonth),
            spending: money(then.spending),
            change: change(now.spending, then.spending),
          }
        : null,
    averageMonthlySpendingBefore:
      pastMonths.length >= 2
        ? money(Math.round(pastMonths.reduce((s, m) => s + m.expenseMinor, 0) / pastMonths.length))
        : null,
    categories: cats.slice(0, 6).map((c) => ({
      name: c.name ?? "No category",
      spent: money(c.spentMinor),
      shareOfSpending: now.spending > 0 ? pct(c.spentMinor, now.spending) : "0%",
      before: money(prevByCat.get(c.categoryId) ?? 0),
      change: change(c.spentMinor, prevByCat.get(c.categoryId) ?? 0),
    })),
    overallLimit,
    budgetsOver: overview.categories
      .filter((b) => b.level === "over")
      .map((b) => ({
        category: b.categoryName ?? "",
        limit: money(b.availableMinor),
        spent: money(b.spentMinor),
        over: money(-b.remainingMinor),
      })),
    budgetsNearLimit: overview.categories
      .filter((b) => b.level === "warning")
      .map((b) => ({
        category: b.categoryName ?? "",
        limit: money(b.availableMinor),
        spent: money(b.spentMinor),
        used: pct(b.spentMinor, b.availableMinor),
      })),
    biggestExpenses: biggest.map((b) => ({
      what: b.description || b.category || "Untitled entry",
      amount: money(b.amountMinor),
      date: shortDate(b.occurredOn),
      category: b.category ?? "No category",
    })),
    possibleDuplicates: dupes.map((d) => ({
      what: d.description || "Untitled entry",
      amount: money(d.amountMinor),
      dates: [shortDate(d.first), shortDate(d.second)],
    })),
    trackedSubscriptions: subs.rules > 0 ? { count: subs.rules, spent: money(subs.spent) } : null,
    priceChanges,
    // Goals that didn't exist yet and had nothing saved by then don't belong in
    // the period (keeps a finished month's facts stable).
    goals: goals
      .filter((g) => g.savedMinor > 0 || g.createdAt < new Date(`${span.to}T00:00:00Z`))
      .map((g) => {
        const p = goalProgress({
          targetMinor: g.targetMinor,
          savedMinor: g.savedMinor,
          targetDate: g.targetDate,
          today: asOf,
        });
        const status = p.reached
          ? "reached"
          : p.overdue
            ? "past its target date"
            : p.perMonthMinor !== null && g.targetDate
              ? `needs ${money(p.perMonthMinor)} a month to reach by ${formatMonth(g.targetDate.slice(0, 7))}`
              : "no target date";
        return {
          name: g.name,
          saved: money(g.savedMinor),
          target: money(g.targetMinor),
          addedInPeriod: money(g.addedMinor),
          status,
        };
      }),
    entriesWithoutCategory: now.uncategorized,
  };
}

export const factsHash = (facts: InsightFacts) => createHash("sha256").update(JSON.stringify(facts)).digest("hex");
