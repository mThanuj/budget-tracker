import { DEFAULT_CATEGORIES } from "@/lib/default-categories";
import { seedDefaultWallet } from "../services/wallets";
import type { Db } from "./index";
import { category } from "./schema";

/** Idempotent: safe to call on every signup or first load. */
export async function seedDefaultCategories(db: Db, userId: string) {
  await db
    .insert(category)
    .values(DEFAULT_CATEGORIES.map((c, i) => ({ ...c, userId, isDefault: true, position: i })))
    .onConflictDoNothing();
}

/** Everything a brand-new account starts with. Idempotent. */
export async function seedNewUser(db: Db, userId: string) {
  await seedDefaultCategories(db, userId);
  await seedDefaultWallet(db, userId);
}
