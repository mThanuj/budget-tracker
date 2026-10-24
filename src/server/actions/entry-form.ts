"use server";

import { todayInTz } from "@/lib/dates";
import { listCategories } from "@/server/services/categories";
import { listWallets } from "@/server/services/wallets";
import { db } from "@/server/db";
import { requireUser } from "@/server/session";

export type EntryFormData = Awaited<ReturnType<typeof getEntryFormData>>;

/**
 * Loaded when the entry dialog opens, so the app shell stays static and the
 * pickers always show the latest wallets and categories.
 */
export async function getEntryFormData() {
  const user = await requireUser();
  const [wallets, categories] = await Promise.all([
    listWallets(db, user.id, { includeArchived: true }),
    listCategories(db, user.id, { includeArchived: true }),
  ]);
  return {
    currency: user.currency ?? "INR",
    today: todayInTz(user.timezone ?? "Asia/Kolkata"),
    defaultWalletId: (user.defaultWalletId as string | null | undefined) ?? null,
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
