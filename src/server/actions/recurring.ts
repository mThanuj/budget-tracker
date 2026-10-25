"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { moneyField, recurringSchema } from "@/lib/validation";
import { type ActionResult, formObject, idSchema, runAction } from "@/server/action-utils";
import { db } from "@/server/db";
import {
  confirmOccurrence,
  createRule,
  deleteRule,
  dismissSubscriptionSuggestion,
  pauseRule,
  resumeRule,
  skipOccurrence,
  trackSubscription,
  updateRule,
} from "@/server/services/recurring";
import { requireUser } from "@/server/session";
import { userCurrency, userToday } from "@/lib/user-prefs";

const merchantKey = z.string().regex(/^[a-z ]{2,60}$/);

export async function saveRule(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    const { id, ...fields } = formObject(formData);
    const today = userToday(user);
    const input = recurringSchema(userCurrency(user), today).parse(fields);
    if (id) await updateRule(db, user.id, idSchema.parse(id), input, today);
    else await createRule(db, user.id, input, today);
    refresh();
  });
}

type RuleOp = "pause" | "resume" | "delete" | "skip";

export async function ruleAction(op: RuleOp, id: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    const ruleId = idSchema.parse(id);
    const today = userToday(user);
    if (op === "pause") await pauseRule(db, user.id, ruleId);
    else if (op === "resume") await resumeRule(db, user.id, ruleId, today);
    else if (op === "delete") await deleteRule(db, user.id, ruleId);
    else if (op === "skip") await skipOccurrence(db, user.id, ruleId, today);
    else throw new Error(`Unknown rule operation: ${op}`);
    refresh();
  });
}

export async function confirmDue(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    const today = userToday(user);
    const fields = z
      .object({
        ruleId: idSchema,
        amount: moneyField(userCurrency(user)),
        occurredOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.")
          .refine((d) => d <= today, "Pick a date that isn't in the future."),
      })
      .parse(formObject(formData));
    await confirmOccurrence(db, user.id, fields.ruleId, { amountMinor: fields.amount, occurredOn: fields.occurredOn }, today);
    refresh();
  });
}

export async function subscriptionSuggestionAction(op: "track" | "dismiss", key: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    const k = merchantKey.parse(key);
    if (op === "track") await trackSubscription(db, user.id, k, userToday(user));
    else if (op === "dismiss") await dismissSubscriptionSuggestion(db, user.id, k);
    else throw new Error(`Unknown suggestion operation: ${op}`);
    refresh();
  });
}
