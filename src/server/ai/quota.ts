import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db";
import { aiUsage } from "../db/schema";
import { aiLimits } from "./config";
import type { AiOutcome } from "./fallback";

const utcDay = (now = new Date()) => now.toISOString().slice(0, 10);

async function bump(db: Db, scope: string, feature: string, day: string): Promise<number> {
  const [row] = await db
    .insert(aiUsage)
    .values({ scope, day, feature, count: 1 })
    .onConflictDoUpdate({
      target: [aiUsage.scope, aiUsage.day, aiUsage.feature],
      set: { count: sql`${aiUsage.count} + 1` },
    })
    .returning({ count: aiUsage.count });
  return row.count;
}

/** Counts one AI request; false once the user's or everyone's daily limit is used up. */
export async function takeAiQuota(db: Db, userId: string, limits = aiLimits(), now = new Date()) {
  const day = utcDay(now);
  if ((await bump(db, `user:${userId}`, "ai", day)) > limits.userDaily) return false;
  if ((await bump(db, "global", "ai", day)) > limits.globalDaily) return false;
  return true;
}

export async function recordProviderOutcome(db: Db, provider: string, outcome: AiOutcome, now = new Date()) {
  await bump(db, `provider:${provider}`, outcome, utcDay(now));
}

/** Counts one chat question; false once the user's daily chat limit is used up. */
export async function takeChatQuota(db: Db, userId: string, limits = aiLimits(), now = new Date()) {
  const day = utcDay(now);
  if ((await bump(db, `user:${userId}`, "chat", day)) > limits.chatDaily) return false;
  if ((await bump(db, "global", "ai", day)) > limits.globalDaily) return false;
  return true;
}

export async function chatQuestionsLeft(db: Db, userId: string, limits = aiLimits(), now = new Date()) {
  const [row] = await db
    .select({ count: aiUsage.count })
    .from(aiUsage)
    .where(and(eq(aiUsage.scope, `user:${userId}`), eq(aiUsage.day, utcDay(now)), eq(aiUsage.feature, "chat")));
  return Math.max(limits.chatDaily - (row?.count ?? 0), 0);
}
