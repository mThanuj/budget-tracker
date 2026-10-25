"use server";

import { refresh } from "next/cache";
import { transactionSchema } from "@/lib/validation";
import { type ActionResult, formObject, idSchema, runAction } from "@/server/action-utils";
import { db } from "@/server/db";
import {
  createTransaction,
  deleteTransaction,
  updateTransaction,
} from "@/server/services/transactions";
import { requireUser } from "@/server/session";
import { userCurrency, userToday } from "@/lib/user-prefs";

export async function saveTransaction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    const { id, ...fields } = formObject(formData);
    const input = transactionSchema(userCurrency(user), userToday(user)).parse(fields);
    if (id) await updateTransaction(db, user.id, idSchema.parse(id), input);
    else await createTransaction(db, user.id, input);
    refresh();
  });
}

export async function removeTransaction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    await deleteTransaction(db, user.id, idSchema.parse(id));
    refresh();
  });
}
