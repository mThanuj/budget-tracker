import "server-only";
import { todayInTz } from "@/lib/dates";
import type { CurrentUser } from "../auth";
import type { Db } from "../db";
import { listCategories } from "../services/categories";
import { learnedCategory } from "../services/merchant-rules";
import { listWallets } from "../services/wallets";
import { aiAccess } from "./access";
import { chooseCategoryWithModel } from "./categorize";
import { providerChain } from "./config";
import { runWithFallback } from "./fallback";
import { type EntryContext, type EntryPrefill, extractEntryWithModel, toPrefill } from "./parse-entry";
import { recordProviderOutcome, takeAiQuota } from "./quota";

export type AiFailure = "disabled" | "limit" | "busy" | "unreadable" | "no_amount";

export function aiConfigured() {
  return providerChain().length > 0;
}

/** AI features show only when a provider is set up and the user hasn't switched them off. */
export function aiAvailableFor(user: Pick<CurrentUser, "aiEnabled">) {
  return aiConfigured() && user.aiEnabled !== false;
}

async function entryContext(db: Db, user: CurrentUser): Promise<EntryContext> {
  const [wallets, categories] = await Promise.all([listWallets(db, user.id), listCategories(db, user.id)]);
  return {
    today: todayInTz(user.timezone ?? "Asia/Kolkata"),
    timeZone: user.timezone ?? "Asia/Kolkata",
    currency: user.currency ?? "INR",
    wallets: wallets.map((w) => ({ id: w.id, name: w.name })),
    defaultWalletId: (user.defaultWalletId as string | null | undefined) ?? null,
    categories: categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
  };
}

export const record = (db: Db) => (provider: string, outcome: Parameters<typeof recordProviderOutcome>[2]) =>
  recordProviderOutcome(db, provider, outcome);

/** Turns a sentence into a filled-in entry. Nothing is saved; the user reviews it. */
export async function parseEntry(
  db: Db,
  user: CurrentUser,
  text: string,
): Promise<{ ok: true; prefill: EntryPrefill } | { ok: false; reason: AiFailure }> {
  if (!aiAvailableFor(user)) return { ok: false, reason: "disabled" };
  const access = await aiAccess(db, user.id);
  if (!(await takeAiQuota(db, user.id, access.limits))) return { ok: false, reason: "limit" };

  const ctx = await entryContext(db, user);
  const result = await runWithFallback(access.chain, (m) => extractEntryWithModel(m, ctx, text), record(db));
  if (!result.ok) return { ok: false, reason: result.reason };

  const prefill = toPrefill(ctx, result.value);
  if (!prefill) return { ok: false, reason: "no_amount" };
  // Fill a missing category from what the user chose before for this merchant.
  if (!prefill.categoryId && prefill.type !== "transfer" && prefill.description) {
    prefill.categoryId = await learnedCategory(db, user.id, prefill.description, prefill.type);
  }
  return { ok: true, prefill };
}

/**
 * A category for a description: the user's own past choice for this merchant
 * first (free and instant), otherwise the AI's pick. Null if neither is available.
 */
export async function suggestCategory(
  db: Db,
  user: CurrentUser,
  input: { description: string; type: "income" | "expense" },
): Promise<{ categoryId: string; source: "learned" | "ai" } | null> {
  const learned = await learnedCategory(db, user.id, input.description, input.type);
  if (learned) return { categoryId: learned, source: "learned" };
  if (!aiAvailableFor(user)) return null;
  const access = await aiAccess(db, user.id);
  if (!(await takeAiQuota(db, user.id, access.limits))) return null;

  const categories = (await listCategories(db, user.id)).filter((c) => c.kind === input.type);
  const result = await runWithFallback(
    access.chain,
    (m) => chooseCategoryWithModel(m, { ...input, categories: categories.map((c) => ({ id: c.id, name: c.name })) }),
    record(db),
  );
  return result.ok && result.value ? { categoryId: result.value, source: "ai" } : null;
}
