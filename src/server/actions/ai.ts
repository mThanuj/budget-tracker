"use server";

import { z } from "zod";
import { withinActionLimit } from "@/server/action-utils";
import { db } from "@/server/db";
import { type AiFailure, parseEntry, suggestCategory } from "@/server/ai";
import type { EntryPrefill } from "@/server/ai/parse-entry";
import { requireUser } from "@/server/session";

export type ParseResult = { ok: true; prefill: EntryPrefill } | { ok: false; reason: AiFailure | "too_short" };

export async function parseEntryText(text: string): Promise<ParseResult> {
  const user = await requireUser();
  if (!(await withinActionLimit(user.id))) return { ok: false, reason: "busy" };
  const parsed = z.string().trim().min(3).max(300).safeParse(text);
  if (!parsed.success) return { ok: false, reason: "too_short" };
  return parseEntry(db, user, parsed.data);
}

export async function suggestCategoryFor(description: string, type: "income" | "expense") {
  const user = await requireUser();
  if (!(await withinActionLimit(user.id))) return null;
  const input = z
    .object({ description: z.string().trim().min(2).max(200), type: z.enum(["income", "expense"]) })
    .safeParse({ description, type });
  if (!input.success) return null;
  return suggestCategory(db, user, input.data);
}
