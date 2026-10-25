"use server";

import { refresh } from "next/cache";
import { contributionSchema, goalSchema } from "@/lib/validation";
import { type ActionResult, formObject, idSchema, runAction } from "@/server/action-utils";
import { db } from "@/server/db";
import { addContribution, archiveGoal, createGoal, deleteGoal, restoreGoal, updateGoal } from "@/server/services/goals";
import { requireUser } from "@/server/session";
import { userCurrency, userToday } from "@/lib/user-prefs";

export async function saveGoal(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    const { id, ...fields } = formObject(formData);
    const input = goalSchema(userCurrency(user), userToday(user)).parse(fields);
    if (id) await updateGoal(db, user.id, idSchema.parse(id), input);
    else await createGoal(db, user.id, input);
    refresh();
  });
}

export async function saveContribution(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    const { goalId, ...fields } = formObject(formData);
    const input = contributionSchema(userCurrency(user), userToday(user)).parse(fields);
    await addContribution(db, user.id, idSchema.parse(goalId), input);
    refresh();
  });
}

type GoalOp = "archive" | "restore" | "delete";
const OPS = { archive: archiveGoal, restore: restoreGoal, delete: deleteGoal } satisfies Record<GoalOp, unknown>;

export async function goalAction(op: GoalOp, id: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    // Own keys only: `in` would also accept inherited names like "toString".
    if (!Object.hasOwn(OPS, op)) throw new Error(`Unknown goal operation: ${String(op)}`);
    await OPS[op](db, user.id, idSchema.parse(id));
    refresh();
  });
}
