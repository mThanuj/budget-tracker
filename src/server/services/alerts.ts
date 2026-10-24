import { and, eq, inArray } from "drizzle-orm";
import { type ISODate, type ISOMonth, monthOf } from "@/lib/dates";
import { goalProgress, highestMilestone } from "@/lib/goals";
import { formatMoney } from "@/lib/money";
import type { Db } from "../db";
import { alertDismissal } from "../db/schema";
import type { getBudgetOverview } from "./budgets";
import type { GoalWithSaved } from "./goals";

export type Alert = {
  key: string;
  tone: "warning" | "over" | "success";
  title: string;
  body: string;
  href: string;
};

type Overview = Awaited<ReturnType<typeof getBudgetOverview>>;

/**
 * In-app alerts derived from current data. Keys include the month (budgets) or
 * milestone (goals), so a dismissed alert comes back only when something new happens.
 */
export function buildAlerts({
  overview,
  goals,
  month,
  today,
  currency,
}: {
  overview: Overview;
  goals: GoalWithSaved[];
  month: ISOMonth;
  today: ISODate;
  currency: string;
}): Alert[] {
  const alerts: Alert[] = [];
  if (month !== monthOf(today)) return alerts;

  const budgets = [...(overview.overall ? [overview.overall] : []), ...overview.categories];
  for (const b of budgets) {
    if (b.level === "ok") continue;
    const name = b.categoryName ?? "your monthly limit";
    const label = b.categoryName ? `${b.categoryName} budget` : "monthly spending limit";
    alerts.push(
      b.level === "over"
        ? {
            key: `budget:${b.id}:${month}:over`,
            tone: "over",
            title: `Over your ${label}`,
            body: `You've spent ${formatMoney(-b.remainingMinor, currency)} more than planned this month.`,
            href: "/budgets",
          }
        : {
            key: `budget:${b.id}:${month}:warning`,
            tone: "warning",
            title: `${Math.floor(b.ratio * 100)}% of ${b.categoryName ? `your ${label}` : name} used`,
            body: `${formatMoney(b.remainingMinor, currency)} left for the rest of the month.`,
            href: "/budgets",
          },
    );
  }

  for (const g of goals) {
    const p = goalProgress({ targetMinor: g.targetMinor, savedMinor: g.savedMinor, targetDate: g.targetDate, today });
    const milestone = highestMilestone(p.ratio);
    if (!milestone) continue;
    alerts.push({
      key: `goal:${g.id}:${milestone}`,
      tone: "success",
      title: milestone === 100 ? `You reached “${g.name}”` : `${milestone}% of the way to “${g.name}”`,
      body:
        milestone === 100
          ? `${formatMoney(g.savedMinor, currency)} set aside. Nicely done.`
          : `${formatMoney(p.remainingMinor, currency)} to go.`,
      href: "/goals",
    });
  }
  return alerts;
}

export async function withoutDismissed(db: Db, userId: string, alerts: Alert[]) {
  if (alerts.length === 0) return alerts;
  const dismissed = await db
    .select({ key: alertDismissal.alertKey })
    .from(alertDismissal)
    .where(and(eq(alertDismissal.userId, userId), inArray(alertDismissal.alertKey, alerts.map((a) => a.key))));
  const hidden = new Set(dismissed.map((d) => d.key));
  return alerts.filter((a) => !hidden.has(a.key));
}

export async function dismissAlert(db: Db, userId: string, key: string) {
  await db.insert(alertDismissal).values({ userId, alertKey: key }).onConflictDoNothing();
}
