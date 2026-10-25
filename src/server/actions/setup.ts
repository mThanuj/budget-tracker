"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { SetupRows, SetupStep } from "@/lib/setup-types";
import { setupSchema } from "@/lib/validation";
import { runAction } from "@/server/action-utils";
import { aiAvailableFor } from "@/server/ai";
import { aiAccess } from "@/server/ai/access";
import { runWithFallback } from "@/server/ai/fallback";
import { recordProviderOutcome, takeAiQuota } from "@/server/ai/quota";
import { extractSetupWithModel, toSetupRows } from "@/server/ai/setup";
import { db } from "@/server/db";
import { listCategories } from "@/server/services/categories";
import { applySetup } from "@/server/services/setup";
import { requireUser } from "@/server/session";
import { userCurrency, userToday } from "@/lib/user-prefs";

export type SetupParseResult =
  | { ok: true; rows: SetupRows[SetupStep] }
  | { ok: false; reason: "disabled" | "limit" | "busy" | "unreadable" | "too_short" };

/** Reads one free-text answer into editable rows for that step. Nothing is saved. */
export async function parseSetupAnswer(step: SetupStep, text: string): Promise<SetupParseResult> {
  const user = await requireUser();
  const input = z
    .object({ step: z.enum(["wallets", "incomes", "bills", "goals"]), text: z.string().trim().min(2).max(500) })
    .safeParse({ step, text });
  if (!input.success) return { ok: false, reason: "too_short" };
  if (!aiAvailableFor(user)) return { ok: false, reason: "disabled" };
  const access = await aiAccess(db, user.id);
  if (!(await takeAiQuota(db, user.id, access.limits))) return { ok: false, reason: "limit" };

  const ctx = {
    today: userToday(user),
    currency: userCurrency(user),
    expenseCategories: (await listCategories(db, user.id))
      .filter((c) => c.kind === "expense")
      .map((c) => ({ id: c.id, name: c.name })),
  };
  const result = await runWithFallback(
    access.chain,
    (m) => extractSetupWithModel(m, input.data.step, ctx, input.data.text),
    (provider, outcome) => recordProviderOutcome(db, provider, outcome),
  );
  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, rows: toSetupRows(input.data.step, result.value, ctx) };
}

export type SetupApplyResult =
  { ok: true; counts: Record<string, number> } | { ok: false; error?: string; fieldErrors?: Record<string, string> };

export async function applySetupAction(payload: unknown): Promise<SetupApplyResult> {
  const user = await requireUser();
  let counts: Record<string, number> = {};
  const result = await runAction(async () => {
    const today = userToday(user);
    const input = setupSchema(userCurrency(user), today).parse(payload);
    counts = await applySetup(db, user.id, input, today);
    refresh();
  });
  if (result?.ok) return { ok: true, counts };
  return result ?? { ok: false, error: "Something went wrong. Try again." };
}
