import { DEFAULT_CATEGORIES } from "@/lib/default-categories";
import type { Db } from "./index";
import { category } from "./schema";

/** Idempotent: safe to call on every signup or first load. */
export async function seedDefaultCategories(db: Db, userId: string) {
  await db
    .insert(category)
    .values(DEFAULT_CATEGORIES.map((c) => ({ ...c, userId, isDefault: true })))
    .onConflictDoNothing();
}
