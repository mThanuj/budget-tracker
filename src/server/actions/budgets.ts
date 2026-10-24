"use server";

import { refresh } from "next/cache";
import { monthOf, todayInTz } from "@/lib/dates";
import { budgetSchema } from "@/lib/validation";
import { type ActionResult, formObject, idSchema, runAction } from "@/server/action-utils";
import { db } from "@/server/db";
import { createBudget, deleteBudget, updateBudget } from "@/server/services/budgets";
import { requireUser } from "@/server/session";

export async function saveBudget(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    const { id, ...fields } = formObject(formData);
    const input = budgetSchema(user.currency ?? "INR").parse(fields);
    const month = monthOf(todayInTz(user.timezone ?? "Asia/Kolkata"));
    if (id) await updateBudget(db, user.id, idSchema.parse(id), input, month);
    else await createBudget(db, user.id, input, month);
    refresh();
  });
}

export async function removeBudget(id: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    await deleteBudget(db, user.id, idSchema.parse(id));
    refresh();
  });
}
