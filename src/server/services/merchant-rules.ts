import { and, eq, isNull, like, or, sql } from "drizzle-orm";
import { normalizeMerchant } from "@/lib/merchant";
import type { Db } from "../db";
import { category, merchantRule } from "../db/schema";

/** How well a learned merchant name fits a description's key; 0 means it doesn't. */
export function matchScore(ruleKey: string, key: string): number {
  if (ruleKey === key) return 1000;
  // "swiggy" fits "swiggy order"; a longer (more specific) learned name fits better.
  if (key.startsWith(`${ruleKey} `)) return ruleKey.length;
  if (ruleKey.startsWith(`${key} `)) return key.length / 2;
  return 0;
}

/** The category this user chose before for the same merchant, if it still fits. */
export async function learnedCategory(db: Db, userId: string, description: string, kind: "income" | "expense") {
  const key = normalizeMerchant(description);
  if (!key) return null;
  const first = key.split(" ")[0];
  const candidates = await db
    .select({ merchantKey: merchantRule.merchantKey, categoryId: merchantRule.categoryId })
    .from(merchantRule)
    .innerJoin(category, eq(category.id, merchantRule.categoryId))
    .where(
      and(
        eq(merchantRule.userId, userId),
        or(eq(merchantRule.merchantKey, first), like(merchantRule.merchantKey, `${first} %`)),
        eq(category.kind, kind),
        isNull(category.archivedAt),
      ),
    );
  let best: { score: number; categoryId: string } | null = null;
  for (const c of candidates) {
    const score = matchScore(c.merchantKey, key);
    if (score > 0 && (!best || score > best.score)) best = { score, categoryId: c.categoryId };
  }
  return best?.categoryId ?? null;
}

/** Remembers (or corrects) the category for a merchant whenever the user saves an entry. */
export async function learnFromEntry(db: Db, userId: string, description: string, categoryId: string | null) {
  const key = normalizeMerchant(description);
  if (!key || !categoryId) return;
  await db
    .insert(merchantRule)
    .values({ userId, merchantKey: key, categoryId })
    .onConflictDoUpdate({
      target: [merchantRule.userId, merchantRule.merchantKey],
      set: { categoryId, hits: sql`${merchantRule.hits} + 1`, updatedAt: new Date() },
    });
}
