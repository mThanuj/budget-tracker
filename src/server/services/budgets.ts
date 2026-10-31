import { and, asc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { budgetProgress, carryIn } from "@/lib/budgets";
import { addMonths, type ISOMonth, monthRange } from "@/lib/dates";
import type { BudgetInput } from "@/lib/validation";
import type { Db } from "../db";
import { budget, category, transaction } from "../db/schema";
import { getOwnedCategory } from "./categories";
import { rethrowUnique, UserError } from "./errors";

export type BudgetStatus = Awaited<ReturnType<typeof getBudgetOverview>>["categories"][number];

/**
 * Every budget's progress for a month, plus the overall limit and how much was
 * spent outside any budgeted category.
 */
export async function getBudgetOverview(db: Db, userId: string, month: ISOMonth) {
  const { start, end } = monthRange(month);
  // Correlated subqueries reference the outer budget row explicitly.
  const spentIn = (from: unknown, to: unknown) =>
    sql<number>`(
    select coalesce(sum(t.amount_minor), 0) from "transaction" t
    where t.user_id = "budget"."user_id" and t.type = 'expense'
      and ("budget"."category_id" is null or t.category_id = "budget"."category_id")
      and t.occurred_on >= ${from} and t.occurred_on < ${to}
  )`.mapWith(Number);

  const rows = await db
    .select({
      id: budget.id,
      categoryId: budget.categoryId,
      amountMinor: budget.amountMinor,
      rollover: budget.rollover,
      rolloverFrom: budget.rolloverFrom,
      categoryName: category.name,
      categoryIcon: category.icon,
      categoryColor: category.color,
      categoryPosition: category.position,
      categoryArchived: sql<boolean>`${category.archivedAt} is not null`,
      spentMinor: spentIn(start, end),
      spentSinceRolloverMinor:
        sql<number>`case when "budget"."rollover" then ${spentIn(sql`"budget"."rollover_from"`, start)} else 0 end`.mapWith(
          Number,
        ),
    })
    .from(budget)
    .leftJoin(category, eq(category.id, budget.categoryId))
    .where(eq(budget.userId, userId))
    .orderBy(asc(category.position));

  const withProgress = rows.map((r) => {
    const carryInMinor =
      r.rollover && r.rolloverFrom
        ? carryIn({
            limitMinor: r.amountMinor,
            rolloverFrom: r.rolloverFrom.slice(0, 7),
            month,
            spentSinceMinor: r.spentSinceRolloverMinor,
          })
        : 0;
    return {
      ...r,
      carryInMinor,
      ...budgetProgress({ limitMinor: r.amountMinor, carryInMinor, spentMinor: r.spentMinor }),
    };
  });

  const [totals] = await db
    .select({
      totalSpentMinor: sql<number>`coalesce(sum(${transaction.amountMinor}), 0)`.mapWith(Number),
      unbudgetedMinor:
        sql<number>`coalesce(sum(${transaction.amountMinor}) filter (where ${transaction.categoryId} is null or not exists (
        select 1 from "budget" b where b.user_id = ${userId} and b.category_id = "transaction"."category_id"
      )), 0)`.mapWith(Number),
    })
    .from(transaction)
    .where(
      and(
        eq(transaction.userId, userId),
        eq(transaction.type, "expense"),
        gte(transaction.occurredOn, start),
        lt(transaction.occurredOn, end),
      ),
    );

  return {
    overall: withProgress.find((b) => b.categoryId === null) ?? null,
    categories: withProgress.filter((b) => b.categoryId !== null),
    ...totals,
  };
}

/**
 * Average monthly spending per category over the 3 months before `month`,
 * counting only months that had spending (so new users get useful numbers).
 * The `null` key is total spending, for the overall limit.
 */
export async function averageMonthlySpending(db: Db, userId: string, month: ISOMonth) {
  const from = monthRange(addMonths(month, -3)).start;
  const to = monthRange(month).start;
  const monthExpr = sql`to_char(${transaction.occurredOn}, 'YYYY-MM')`;
  const perMonth = await db
    .select({
      categoryId: transaction.categoryId,
      month: sql<string>`${monthExpr}`,
      spent: sql<number>`sum(${transaction.amountMinor})`.mapWith(Number),
    })
    .from(transaction)
    .where(
      and(
        eq(transaction.userId, userId),
        eq(transaction.type, "expense"),
        gte(transaction.occurredOn, from),
        lt(transaction.occurredOn, to),
      ),
    )
    .groupBy(transaction.categoryId, monthExpr);

  const sums = new Map<string | null, { total: number; months: Set<string> }>();
  const add = (key: string | null, m: string, v: number) => {
    const entry = sums.get(key) ?? { total: 0, months: new Set<string>() };
    entry.total += v;
    entry.months.add(m);
    sums.set(key, entry);
  };
  for (const r of perMonth) {
    if (r.categoryId) add(r.categoryId, r.month, r.spent);
    add(null, r.month, r.spent);
  }
  return new Map([...sums].map(([k, v]) => [k, Math.round(v.total / v.months.size)]));
}

async function getOwnedBudget(db: Db, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(budget)
    .where(and(eq(budget.id, id), eq(budget.userId, userId)));
  if (!row) throw new UserError("That budget doesn't exist.");
  return row;
}

/** A second budget with the same category is a message on the form, not a crash. */
const rethrowDuplicate = rethrowUnique(
  "budget_user_category_key",
  "There's already a budget for that. Edit it instead.",
  "categoryId",
);

export async function createBudget(db: Db, userId: string, input: BudgetInput, currentMonth: ISOMonth) {
  if (input.categoryId) {
    const c = await getOwnedCategory(db, userId, input.categoryId);
    if (c.kind !== "expense") throw new UserError("Budgets are for spending categories.", "categoryId");
  }
  const rollover = input.categoryId !== null && input.rollover;
  const [row] = await db
    .insert(budget)
    .values({
      userId,
      categoryId: input.categoryId,
      amountMinor: input.amount,
      rollover,
      rolloverFrom: rollover ? `${currentMonth}-01` : null,
    })
    .returning()
    .catch(rethrowDuplicate);
  return row;
}

/**
 * Changing the amount or switching rollover on restarts the carry from this
 * month, so earlier months are never re-judged against a new limit.
 */
export async function updateBudget(
  db: Db,
  userId: string,
  id: string,
  input: Pick<BudgetInput, "amount" | "rollover">,
  currentMonth: ISOMonth,
) {
  const existing = await getOwnedBudget(db, userId, id);
  const rollover = existing.categoryId !== null && input.rollover;
  const restart = input.amount !== existing.amountMinor || !existing.rollover;
  const rolloverFrom = rollover ? (restart ? `${currentMonth}-01` : existing.rolloverFrom) : null;
  const [row] = await db
    .update(budget)
    .set({ amountMinor: input.amount, rollover, rolloverFrom })
    .where(and(eq(budget.id, id), eq(budget.userId, userId)))
    .returning();
  return row;
}

export async function deleteBudget(db: Db, userId: string, id: string) {
  await getOwnedBudget(db, userId, id);
  await db.delete(budget).where(and(eq(budget.id, id), eq(budget.userId, userId)));
}

/** Expense categories that don't have a budget yet (for the "add budget" picker). */
export async function unbudgetedCategories(db: Db, userId: string) {
  return db
    .select({ id: category.id, name: category.name, icon: category.icon, color: category.color })
    .from(category)
    .leftJoin(budget, and(eq(budget.categoryId, category.id), eq(budget.userId, userId)))
    .where(
      and(eq(category.userId, userId), eq(category.kind, "expense"), isNull(category.archivedAt), isNull(budget.id)),
    )
    .orderBy(asc(category.position));
}
