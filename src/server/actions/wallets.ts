"use server";

import { refresh } from "next/cache";
import { walletSchema } from "@/lib/validation";
import { type ActionResult, formObject, idSchema, runAction } from "@/server/action-utils";
import { db } from "@/server/db";
import {
  archiveWallet,
  createWallet,
  deleteWallet,
  restoreWallet,
  setDefaultWallet,
  updateWallet,
} from "@/server/services/wallets";
import { requireUser } from "@/server/session";

export async function saveWallet(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    const { id, ...fields } = formObject(formData);
    const input = walletSchema(user.currency ?? "INR").parse(fields);
    if (id) await updateWallet(db, user.id, idSchema.parse(id), input);
    else await createWallet(db, user.id, input);
    refresh();
  });
}

type WalletOp = "archive" | "restore" | "delete" | "makeDefault";

const OPS = {
  archive: archiveWallet,
  restore: restoreWallet,
  delete: deleteWallet,
  makeDefault: setDefaultWallet,
} satisfies Record<WalletOp, unknown>;

export async function walletAction(op: WalletOp, id: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    if (!(op in OPS)) throw new Error(`Unknown wallet operation: ${op}`);
    await OPS[op](db, user.id, idSchema.parse(id));
    refresh();
  });
}
