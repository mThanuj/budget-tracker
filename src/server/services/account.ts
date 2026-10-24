import { eq } from "drizzle-orm";
import { minorToInput } from "@/lib/money";
import type { Db } from "../db";
import { aiUsage, user } from "../db/schema";
import { listTransactions } from "./transactions";

/**
 * One CSV cell. Quotes when needed, and defuses text a spreadsheet would run
 * as a formula (=, +, -, @ at the start).
 */
export function csvCell(value: string | number | null | undefined, { text = true } = {}) {
  let s = value === null || value === undefined ? "" : String(value);
  if (text && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const TYPE_LABEL = { income: "Income", expense: "Expense", transfer: "Transfer" } as const;

/** Every entry, oldest first, as a spreadsheet-friendly CSV (UTF-8 with BOM for Excel). */
export async function entriesCsv(db: Db, userId: string, currency: string) {
  const rows = (await listTransactions(db, userId, {}, 1_000_000)).reverse();
  const header = ["Date", "Type", "Amount", "Currency", "Description", "Category", "Wallet", "To wallet", "Notes", "Added by"];
  const lines = rows.map((r) =>
    [
      csvCell(r.occurredOn, { text: false }),
      csvCell(TYPE_LABEL[r.type]),
      csvCell(minorToInput(r.amountMinor, currency), { text: false }),
      csvCell(currency),
      csvCell(r.description),
      csvCell(r.categoryName),
      csvCell(r.walletName),
      csvCell(r.toWalletName),
      csvCell(r.notes),
      csvCell(r.source),
    ].join(","),
  );
  return `\uFEFF${[header.join(","), ...lines].join("\r\n")}\r\n`;
}

/** Removes the user and everything they own (rows cascade from the user), plus their usage counters. */
export async function deleteAccountData(db: Db, userId: string) {
  await db.transaction(async (tx) => {
    await tx.delete(aiUsage).where(eq(aiUsage.scope, `user:${userId}`));
    await tx.delete(user).where(eq(user.id, userId));
  });
}
