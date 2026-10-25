"use server";

import { refresh } from "next/cache";
import { categorySchema } from "@/lib/validation";
import { type ActionResult, formObject, idSchema, runAction } from "@/server/action-utils";
import { db } from "@/server/db";
import {
  archiveCategory,
  createCategory,
  deleteCategory,
  restoreCategory,
  updateCategory,
} from "@/server/services/categories";
import { requireUser } from "@/server/session";

export async function saveCategory(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    const { id, ...fields } = formObject(formData);
    if (id) {
      const input = categorySchema.omit({ kind: true }).parse(fields);
      await updateCategory(db, user.id, idSchema.parse(id), input);
    } else {
      await createCategory(db, user.id, categorySchema.parse(fields));
    }
    refresh();
  });
}

type CategoryOp = "archive" | "restore" | "delete";

const OPS = {
  archive: archiveCategory,
  restore: restoreCategory,
  delete: deleteCategory,
} satisfies Record<CategoryOp, unknown>;

export async function categoryAction(op: CategoryOp, id: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    // Own keys only: `in` would also accept inherited names like "toString".
    if (!Object.hasOwn(OPS, op)) throw new Error(`Unknown category operation: ${String(op)}`);
    await OPS[op](db, user.id, idSchema.parse(id));
    refresh();
  });
}
