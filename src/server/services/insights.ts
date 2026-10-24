import { and, eq, sql } from "drizzle-orm";
import type { ISOMonth } from "@/lib/dates";
import type { InsightKind, InsightReport } from "@/lib/insights";
import type { Db } from "../db";
import { aiUsage, insight } from "../db/schema";

const periodKey = (kind: InsightKind, month: ISOMonth) => `${kind}:${month}`;

export async function getInsight(db: Db, userId: string, kind: InsightKind, month: ISOMonth) {
  const [row] = await db
    .select()
    .from(insight)
    .where(and(eq(insight.userId, userId), eq(insight.period, periodKey(kind, month))));
  return row ? { ...row, report: row.report as InsightReport } : null;
}

export async function saveInsight(
  db: Db,
  userId: string,
  { kind, month, factsHash, report, model }: { kind: InsightKind; month: ISOMonth; factsHash: string; report: InsightReport; model: string },
) {
  const values = { factsHash, report, model, createdAt: new Date() };
  await db
    .insert(insight)
    .values({ userId, period: periodKey(kind, month), ...values })
    .onConflictDoUpdate({ target: [insight.userId, insight.period], set: values });
}

// Rewrites (check-ins and updates after edits) are counted per calendar month,
// on that month's first day in the usage table.
const refreshRow = (userId: string, month: ISOMonth) => ({ scope: `user:${userId}`, day: `${month}-01`, feature: "insight_refresh" });

export async function refreshesUsed(db: Db, userId: string, month: ISOMonth) {
  const k = refreshRow(userId, month);
  const [row] = await db
    .select({ count: aiUsage.count })
    .from(aiUsage)
    .where(and(eq(aiUsage.scope, k.scope), eq(aiUsage.day, k.day), eq(aiUsage.feature, k.feature)));
  return row?.count ?? 0;
}

/** Takes one rewrite; false (and nothing taken) once the month's are used up. */
export async function takeRefresh(db: Db, userId: string, month: ISOMonth, limit: number) {
  const [row] = await db
    .insert(aiUsage)
    .values({ ...refreshRow(userId, month), count: 1 })
    .onConflictDoUpdate({ target: [aiUsage.scope, aiUsage.day, aiUsage.feature], set: { count: sql`${aiUsage.count} + 1` } })
    .returning({ count: aiUsage.count });
  if (row.count <= limit) return true;
  await giveBackRefresh(db, userId, month);
  return false;
}

/** Returns a rewrite when writing failed, so a busy AI doesn't cost the user one. */
export async function giveBackRefresh(db: Db, userId: string, month: ISOMonth) {
  const k = refreshRow(userId, month);
  await db
    .update(aiUsage)
    .set({ count: sql`greatest(${aiUsage.count} - 1, 0)` })
    .where(and(eq(aiUsage.scope, k.scope), eq(aiUsage.day, k.day), eq(aiUsage.feature, k.feature)));
}
