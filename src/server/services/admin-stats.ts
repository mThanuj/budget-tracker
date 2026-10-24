import { and, count, countDistinct, gte, like, sql } from "drizzle-orm";
import { PRICES } from "@/config/plans";
import type { Db } from "../db";
import { aiUsage, subscription, transaction, user } from "../db/schema";
import { planFromSubscriptions } from "../billing/plan";

const daysAgo = (n: number, now: Date) => new Date(now.getTime() - n * 86_400_000);
const utcDay = (d: Date) => d.toISOString().slice(0, 10);

export async function adminStats(db: Db, now: Date = new Date()) {
  const since7 = daysAgo(7, now);
  const since30 = daysAgo(30, now);
  const fromDay = utcDay(daysAgo(13, now));

  const [users, active, subs, usage] = await Promise.all([
    db
      .select({
        total: count(),
        new7: sql<number>`count(*) filter (where ${user.createdAt} >= ${since7})`.mapWith(Number),
        new30: sql<number>`count(*) filter (where ${user.createdAt} >= ${since30})`.mapWith(Number),
        onboarded: sql<number>`count(*) filter (where ${user.onboardedAt} is not null)`.mapWith(Number),
        aiOff: sql<number>`count(*) filter (where ${user.aiEnabled} = false)`.mapWith(Number),
      })
      .from(user)
      .then((r) => r[0]),
    db
      .select({ users7: countDistinct(transaction.userId), entries7: count() })
      .from(transaction)
      .where(gte(transaction.createdAt, since7))
      .then((r) => r[0]),
    db.select().from(subscription),
    db
      .select({ scope: aiUsage.scope, day: aiUsage.day, feature: aiUsage.feature, count: aiUsage.count })
      .from(aiUsage)
      .where(and(gte(aiUsage.day, fromDay), sql`(${aiUsage.scope} = 'global' or ${like(aiUsage.scope, "provider:%")} or ${aiUsage.feature} = 'chat')`)),
  ]);

  // Pro, using the same rules the app applies to each user.
  const byUser = Map.groupBy(subs, (s) => s.userId);
  const pro = { total: 0, monthly: 0, yearly: 0, ending: 0, paymentProblems: 0, doubleBilled: 0 };
  for (const rows of byUser.values()) {
    // Two renewing subscriptions (e.g. paid in two tabs): refund one by hand.
    if (rows.filter((r) => r.status === "active" || r.status === "pending").length > 1) pro.doubleBilled++;
    const plan = planFromSubscriptions(rows, now);
    if (plan.id !== "pro" || !plan.subscription) continue;
    pro.total++;
    if (plan.subscription.interval === "yearly") pro.yearly++;
    else pro.monthly++;
    if (plan.subscription.endsAt) pro.ending++;
    if (plan.subscription.paymentProblem) pro.paymentProblems++;
  }
  const mrrMinor = Math.round(pro.monthly * PRICES.monthly.amountMinor + (pro.yearly * PRICES.yearly.amountMinor) / 12);

  // AI per day: all requests (global counter), chat questions, provider outcomes.
  const days = Array.from({ length: 14 }, (_, i) => utcDay(daysAgo(13 - i, now)));
  const perDay = new Map(days.map((d) => [d, { day: d, requests: 0, chat: 0, fallbacks: 0 }]));
  const providers = new Map<string, Record<string, number>>();
  const recent = utcDay(daysAgo(6, now));
  for (const u of usage) {
    const row = perDay.get(u.day);
    if (u.scope === "global" && u.feature === "ai" && row) row.requests += u.count;
    else if (u.scope.startsWith("user:") && u.feature === "chat" && row) row.chat += u.count;
    else if (u.scope.startsWith("provider:")) {
      if (u.feature !== "ok" && row) row.fallbacks += u.count;
      if (u.day < recent) continue;
      const name = u.scope.slice("provider:".length);
      const outcomes = providers.get(name) ?? {};
      outcomes[u.feature] = (outcomes[u.feature] ?? 0) + u.count;
      providers.set(name, outcomes);
    }
  }

  return {
    users: { ...users, active7: active.users7, entries7: active.entries7 },
    pro: { ...pro, mrrMinor },
    aiByDay: [...perDay.values()].reverse(),
    providers: [...providers.entries()].map(([name, outcomes]) => ({ name, outcomes })),
  };
}
