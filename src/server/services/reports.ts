import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { addMonths, type ISODate, type ISOMonth, monthRange } from "@/lib/dates";
import type { Db } from "../db";
import { category, transaction } from "../db/schema";

/** Spending per category between two dates (end exclusive), largest first. */
export async function spendingByCategory(db: Db, userId: string, from: ISODate, to: ISODate) {
  return db
    .select({
      categoryId: transaction.categoryId,
      name: category.name,
      icon: category.icon,
      color: category.color,
      spentMinor: sql<number>`sum(${transaction.amountMinor})`.mapWith(Number),
    })
    .from(transaction)
    .leftJoin(category, eq(category.id, transaction.categoryId))
    .where(
      and(
        eq(transaction.userId, userId),
        eq(transaction.type, "expense"),
        gte(transaction.occurredOn, from),
        lt(transaction.occurredOn, to),
      ),
    )
    .groupBy(transaction.categoryId, category.name, category.icon, category.color)
    .orderBy(desc(sql`sum(${transaction.amountMinor})`));
}

/** Income and spending for each month in [fromMonth, toMonth], zero-filled. Transfers excluded. */
export async function monthlyTotals(db: Db, userId: string, fromMonth: ISOMonth, toMonth: ISOMonth) {
  const monthExpr = sql<string>`to_char(${transaction.occurredOn}, 'YYYY-MM')`;
  const rows = await db
    .select({
      month: monthExpr,
      incomeMinor:
        sql<number>`coalesce(sum(${transaction.amountMinor}) filter (where ${transaction.type} = 'income'), 0)`.mapWith(
          Number,
        ),
      expenseMinor:
        sql<number>`coalesce(sum(${transaction.amountMinor}) filter (where ${transaction.type} = 'expense'), 0)`.mapWith(
          Number,
        ),
    })
    .from(transaction)
    .where(
      and(
        eq(transaction.userId, userId),
        gte(transaction.occurredOn, monthRange(fromMonth).start),
        lt(transaction.occurredOn, monthRange(toMonth).end),
      ),
    )
    .groupBy(monthExpr);

  const byMonth = new Map(rows.map((r) => [r.month, r]));
  const out: { month: ISOMonth; incomeMinor: number; expenseMinor: number }[] = [];
  for (let m = fromMonth; m <= toMonth; m = addMonths(m, 1)) {
    const r = byMonth.get(m);
    out.push({ month: m, incomeMinor: r?.incomeMinor ?? 0, expenseMinor: r?.expenseMinor ?? 0 });
  }
  return out;
}
