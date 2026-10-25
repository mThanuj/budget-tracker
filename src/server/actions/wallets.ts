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
import { userCurrency } from "@/lib/user-prefs";

export async function saveWallet(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    const { id, ...fields } = formObject(formData);
    const input = walletSchema(userCurrency(user)).parse(fields);
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
    // Own keys only: `in` would also accept inherited names like "toString".
    if (!Object.hasOwn(OPS, op)) throw new Error(`Unknown wallet operation: ${String(op)}`);
    await OPS[op](db, user.id, idSchema.parse(id));
    refresh();
  });
}
