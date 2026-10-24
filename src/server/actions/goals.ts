"use server";

import { refresh } from "next/cache";
import { todayInTz } from "@/lib/dates";
import { contributionSchema, goalSchema } from "@/lib/validation";
import { type ActionResult, formObject, idSchema, runAction } from "@/server/action-utils";
import { db } from "@/server/db";
import {
  addContribution,
  archiveGoal,
  createGoal,
  deleteGoal,
  restoreGoal,
  updateGoal,
} from "@/server/services/goals";
import { requireUser } from "@/server/session";

const today = (tz: string | null | undefined) => todayInTz(tz ?? "Asia/Kolkata");

export async function saveGoal(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    const { id, ...fields } = formObject(formData);
    const input = goalSchema(user.currency ?? "INR", today(user.timezone)).parse(fields);
    if (id) await updateGoal(db, user.id, idSchema.parse(id), input);
    else await createGoal(db, user.id, input);
    refresh();
  });
}

export async function saveContribution(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    const { goalId, ...fields } = formObject(formData);
    const input = contributionSchema(user.currency ?? "INR", today(user.timezone)).parse(fields);
    await addContribution(db, user.id, idSchema.parse(goalId), input);
    refresh();
  });
}

type GoalOp = "archive" | "restore" | "delete";
const OPS = { archive: archiveGoal, restore: restoreGoal, delete: deleteGoal } satisfies Record<GoalOp, unknown>;

export async function goalAction(op: GoalOp, id: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    if (!(op in OPS)) throw new Error(`Unknown goal operation: ${op}`);
    await OPS[op](db, user.id, idSchema.parse(id));
    refresh();
  });
}
