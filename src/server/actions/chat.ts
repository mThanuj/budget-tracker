"use server";

import type { ModelMessage } from "ai";
import { z } from "zod";
import { todayInTz } from "@/lib/dates";
import { aiAvailableFor } from "@/server/ai";
import { answerWithModel, chatInstructions, moneyTools } from "@/server/ai/chat";
import { providerChain } from "@/server/ai/config";
import { runWithFallback } from "@/server/ai/fallback";
import { chatQuestionsLeft, recordProviderOutcome, takeChatQuota } from "@/server/ai/quota";
import { db } from "@/server/db";
import { requireUser } from "@/server/session";

const history = z
  .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(2000) }))
  .min(1)
  .max(20)
  .refine((m) => m.at(-1)?.role === "user", "The last message must be a question.");

export type ChatReply =
  | { ok: true; text: string; lookedUp: string[]; left: number }
  | { ok: false; reason: "disabled" | "limit" | "busy" | "invalid"; left: number };

/**
 * Answers the latest question from the user's own data. The conversation lives
 * only in the browser; nothing is stored. Only the last 10 messages are sent.
 */
export async function askMoney(messages: { role: "user" | "assistant"; content: string }[]): Promise<ChatReply> {
  const user = await requireUser();
  const parsed = history.safeParse(messages);
  if (!parsed.success) return { ok: false, reason: "invalid", left: await chatQuestionsLeft(db, user.id) };
  if (!aiAvailableFor(user)) return { ok: false, reason: "disabled", left: 0 };
  if (!(await takeChatQuota(db, user.id))) return { ok: false, reason: "limit", left: 0 };

  const u = { id: user.id, currency: user.currency ?? "INR", today: todayInTz(user.timezone ?? "Asia/Kolkata") };
  const tools = moneyTools(db, u);
  const instructions = chatInstructions(u);
  const recent = parsed.data.slice(-10) as ModelMessage[];
  const result = await runWithFallback(
    providerChain(),
    (m) => answerWithModel(m, { tools, instructions, messages: recent }),
    (provider, outcome) => recordProviderOutcome(db, provider, outcome),
    Date.now,
    "chat",
  );
  const left = await chatQuestionsLeft(db, user.id);
  if (!result.ok) return { ok: false, reason: "busy", left };
  return { ok: true, ...result.value, left };
}

export async function chatStatus() {
  const user = await requireUser();
  return { available: aiAvailableFor(user), left: await chatQuestionsLeft(db, user.id) };
}
