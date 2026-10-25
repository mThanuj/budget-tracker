"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { addMonths, monthOf } from "@/lib/dates";
import { type InsightKind, MIN_ENTRIES_FOR_INSIGHTS } from "@/lib/insights";
import { aiAvailableFor, record } from "@/server/ai";
import { aiAccess } from "@/server/ai/access";
import { runWithFallback } from "@/server/ai/fallback";
import { writeInsightWithModel } from "@/server/ai/insights";
import { takeAiQuota } from "@/server/ai/quota";
import { db } from "@/server/db";
import { buildInsightFacts, factsHash } from "@/server/services/insight-facts";
import { getInsight, giveBackRefresh, saveInsight, takeRefresh } from "@/server/services/insights";
import { requireUser } from "@/server/session";
import { userCurrency, userToday } from "@/lib/user-prefs";

export type WriteInsightResult =
  | { ok: true }
  | { ok: false; reason: "pro" | "disabled" | "not_enough" | "refreshes" | "limit" | "busy" | "unreadable" };

/**
 * Writes last month's report ("month") or a check-in on this month ("so_far").
 * The first report for a finished month is included; check-ins and updates
 * after editing entries use one of the month's rewrites.
 */
export async function writeInsight(kind: InsightKind): Promise<WriteInsightResult> {
  const user = await requireUser();
  const parsedKind = z.enum(["month", "so_far"]).safeParse(kind);
  if (!parsedKind.success) return { ok: false, reason: "not_enough" };
  const access = await aiAccess(db, user.id);
  if (!access.plan.limits.insights) return { ok: false, reason: "pro" };
  if (!aiAvailableFor(user)) return { ok: false, reason: "disabled" };

  const today = userToday(user);
  const thisMonth = monthOf(today);
  const month = parsedKind.data === "month" ? addMonths(thisMonth, -1) : thisMonth;
  const facts = await buildInsightFacts(db, user.id, {
    kind: parsedKind.data,
    month,
    today,
    currency: userCurrency(user),
  });
  if (facts.entries < MIN_ENTRIES_FOR_INSIGHTS) return { ok: false, reason: "not_enough" };

  const hash = factsHash(facts);
  const existing = await getInsight(db, user.id, parsedKind.data, month);
  if (parsedKind.data === "month" && existing?.factsHash === hash) return { ok: true }; // already up to date
  const usesRewrite = parsedKind.data === "so_far" || existing !== null;
  if (usesRewrite && !(await takeRefresh(db, user.id, thisMonth, access.plan.limits.insightRefreshesPerMonth))) {
    return { ok: false, reason: "refreshes" };
  }
  const giveBack = () => (usesRewrite ? giveBackRefresh(db, user.id, thisMonth) : Promise.resolve());
  if (!(await takeAiQuota(db, user.id, access.limits))) {
    await giveBack();
    return { ok: false, reason: "limit" };
  }

  const result = await runWithFallback(
    access.chain,
    (m) => writeInsightWithModel(m, facts),
    record(db),
    Date.now,
    "chat",
  );
  if (!result.ok) {
    await giveBack();
    return { ok: false, reason: result.reason };
  }
  await saveInsight(db, user.id, {
    kind: parsedKind.data,
    month,
    factsHash: hash,
    report: result.value,
    model: result.provider,
  });
  refresh();
  return { ok: true };
}
