"use server";

import { aiAvailableFor } from "@/server/ai";
import { listCategories } from "@/server/services/categories";
import { listWallets } from "@/server/services/wallets";
import { db } from "@/server/db";
import { requireUser } from "@/server/session";
import { userCurrency, userToday } from "@/lib/user-prefs";

export type EntryFormData = Awaited<ReturnType<typeof getEntryFormData>>;

/**
 * Loaded when the entry dialog opens, so the shell on every page doesn't query
 * wallets and categories, and the pickers always show the latest.
 */
export async function getEntryFormData() {
  const user = await requireUser();
  const [wallets, categories] = await Promise.all([
    listWallets(db, user.id, { includeArchived: true }),
    listCategories(db, user.id, { includeArchived: true }),
  ]);
  return {
    currency: userCurrency(user),
    today: userToday(user),
    defaultWalletId: user.defaultWalletId ?? null,
    ai: aiAvailableFor(user),
    wallets: wallets.map((w) => ({ id: w.id, name: w.name, kind: w.kind, archived: w.archivedAt !== null })),
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      icon: c.icon,
      color: c.color,
      archived: c.archivedAt !== null,
    })),
  };
}
