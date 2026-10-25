"use server";

import type { ModelMessage } from "ai";
import { z } from "zod";
import { aiAvailableFor } from "@/server/ai";
import { answerWithModel, chatInstructions, moneyTools } from "@/server/ai/chat";
import { aiAccess } from "@/server/ai/access";
import { runWithFallback } from "@/server/ai/fallback";
import { chatQuestionsLeft, recordProviderOutcome, takeChatQuota } from "@/server/ai/quota";
import { razorpayConfig } from "@/server/billing/razorpay";
import { db } from "@/server/db";
import { requireUser } from "@/server/session";
import { userCurrency, userToday } from "@/lib/user-prefs";

const history = z
  .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(2000) }))
  .min(1)
  .max(20)
  .refine((m) => m.at(-1)?.role === "user", "The last message must be a question.");

export type ChatReply =
  | { ok: true; text: string; lookedUp: string[]; left: number }
  | { ok: false; reason: "disabled" | "limit" | "busy" | "invalid"; left: number; upgrade?: boolean };

/**
 * Answers the latest question from the user's own data. The conversation lives
 * only in the browser; nothing is stored. Only the last 10 messages are sent.
 */
export async function askMoney(messages: { role: "user" | "assistant"; content: string }[]): Promise<ChatReply> {
  const user = await requireUser();
  const access = await aiAccess(db, user.id);
  const parsed = history.safeParse(messages);
  if (!parsed.success)
    return { ok: false, reason: "invalid", left: await chatQuestionsLeft(db, user.id, access.limits) };
  if (!aiAvailableFor(user)) return { ok: false, reason: "disabled", left: 0 };
  if (!(await takeChatQuota(db, user.id, access.limits))) {
    return { ok: false, reason: "limit", left: 0, upgrade: canUpgrade(access.plan.id) };
  }

  const u = { id: user.id, currency: userCurrency(user), today: userToday(user) };
  const tools = moneyTools(db, u);
  const instructions = chatInstructions(u);
  const recent = parsed.data.slice(-10) as ModelMessage[];
  const result = await runWithFallback(
    access.chain,
    (m) => answerWithModel(m, { tools, instructions, messages: recent }),
    (provider, outcome) => recordProviderOutcome(db, provider, outcome),
    Date.now,
    "chat",
  );
  const left = await chatQuestionsLeft(db, user.id, access.limits);
  if (!result.ok) return { ok: false, reason: "busy", left };
  return { ok: true, ...result.value, left };
}

/** Free users who run out are pointed at Pro, but only once payments are set up. */
const canUpgrade = (plan: "free" | "pro") => plan === "free" && razorpayConfig() !== null;
