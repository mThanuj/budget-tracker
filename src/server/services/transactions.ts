import { and, desc, eq, gte, ilike, isNull, lt, lte, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { LIMITS } from "@/config/limits";
import { alias } from "drizzle-orm/pg-core";
import type { ISODate } from "@/lib/dates";
import { normalizeMerchant } from "@/lib/merchant";
import type { TransactionInput } from "@/lib/validation";
import type { Db } from "../db";
import { category, deletedEntry, recurringRule, transaction, wallet } from "../db/schema";
import { getOwnedCategory } from "./categories";
import { learnFromEntry } from "./merchant-rules";
import { rethrowUnique, UserError } from "./errors";
import { assertDailyRoomFor } from "./limits";
import { getOwnedWallet } from "./wallets";

export type TransactionFilters = {
  from?: ISODate; // inclusive
  to?: ISODate; // exclusive
  walletId?: string;
  categoryId?: string | "none";
  type?: "income" | "expense" | "transfer";
  q?: string;
  minMinor?: number; // inclusive
  maxMinor?: number; // inclusive
};

function conditions(userId: string, f: TransactionFilters): SQL | undefined {
  const conds: (SQL | undefined)[] = [eq(transaction.userId, userId)];
  if (f.from) conds.push(gte(transaction.occurredOn, f.from));
  if (f.to) conds.push(lt(transaction.occurredOn, f.to));
  if (f.walletId) conds.push(or(eq(transaction.walletId, f.walletId), eq(transaction.toWalletId, f.walletId)));
  if (f.categoryId === "none") conds.push(and(isNull(transaction.categoryId), sql`${transaction.type} <> 'transfer'`));
  else if (f.categoryId) conds.push(eq(transaction.categoryId, f.categoryId));
  if (f.type) conds.push(eq(transaction.type, f.type));
  if (f.minMinor !== undefined) conds.push(gte(transaction.amountMinor, f.minMinor));
  if (f.maxMinor !== undefined) conds.push(lte(transaction.amountMinor, f.maxMinor));
  if (f.q?.trim()) {
    const pattern = `%${f.q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conds.push(or(ilike(transaction.description, pattern), ilike(transaction.notes, pattern)));
  }
  return and(...conds);
}

const toWallet = alias(wallet, "to_wallet");

export type TransactionRow = Awaited<ReturnType<typeof listTransactions>>[number];

export async function listTransactions(db: Db, userId: string, filters: TransactionFilters = {}, limit = 500) {
  return db
    .select({
      id: transaction.id,
      type: transaction.type,
      amountMinor: transaction.amountMinor,
      occurredOn: transaction.occurredOn,
      description: transaction.description,
      notes: transaction.notes,
      source: transaction.source,
      walletId: transaction.walletId,
      walletName: wallet.name,
      toWalletId: transaction.toWalletId,
      toWalletName: toWallet.name,
      categoryId: transaction.categoryId,
      categoryName: category.name,
      categoryIcon: category.icon,
      categoryColor: category.color,
    })
    .from(transaction)
    .innerJoin(wallet, eq(wallet.id, transaction.walletId))
    .leftJoin(toWallet, eq(toWallet.id, transaction.toWalletId))
    .leftJoin(category, eq(category.id, transaction.categoryId))
    .where(conditions(userId, filters))
    .orderBy(desc(transaction.occurredOn), desc(transaction.createdAt))
    .limit(limit);
}

/** Income and spending for the filtered entries. Transfers are not spending. */
export async function summarizeTransactions(db: Db, userId: string, filters: TransactionFilters = {}) {
  const [row] = await db
    .select({
      incomeMinor:
        sql<number>`coalesce(sum(${transaction.amountMinor}) filter (where ${transaction.type} = 'income'), 0)`.mapWith(
          Number,
        ),
      expenseMinor:
        sql<number>`coalesce(sum(${transaction.amountMinor}) filter (where ${transaction.type} = 'expense'), 0)`.mapWith(
          Number,
        ),
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(transaction)
    .where(conditions(userId, filters));
  return row;
}

async function getOwnedTransaction(db: Db, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(transaction)
    .where(and(eq(transaction.id, id), eq(transaction.userId, userId)));
  if (!row) throw new UserError("That entry doesn't exist.");
  return row;
}

export type EntryReferences = {
  type: "income" | "expense" | "transfer";
  walletId: string;
  toWalletId: string | null;
  categoryId: string | null;
};

/**
 * Wallets and category must belong to the user. Archived ones can't receive
 * new entries, but an existing entry (or recurring item) may keep the one it has.
 * Shared by transactions and recurring items.
 */
export async function assertEntryReferences(
  db: Db,
  userId: string,
  input: EntryReferences,
  existing?: Partial<EntryReferences>,
) {
  const from = await getOwnedWallet(db, userId, input.walletId);
  if (from.archivedAt && from.id !== existing?.walletId) {
    throw new UserError("That wallet is archived. Restore it first.", "walletId");
  }
  if (input.toWalletId) {
    const to = await getOwnedWallet(db, userId, input.toWalletId).catch((err: unknown) => {
      // The same refusal, on the field the person can fix; a real failure stays one.
      if (err instanceof UserError) throw new UserError(err.message, "toWalletId");
      throw err;
    });
    if (to.archivedAt && to.id !== existing?.toWalletId) {
      throw new UserError("That wallet is archived. Restore it first.", "toWalletId");
    }
  }
  if (input.categoryId) {
    const c = await getOwnedCategory(db, userId, input.categoryId);
    if (c.kind !== input.type) {
      throw new UserError(`“${c.name}” is ${c.kind === "income" ? "an income" : "a spending"} category.`, "categoryId");
    }
    if (c.archivedAt && c.id !== existing?.categoryId) {
      throw new UserError("That category is archived. Restore it first.", "categoryId");
    }
  }
}

function toRow(input: TransactionInput) {
  return {
    merchantKey: normalizeMerchant(input.description) || null,
    type: input.type,
    amountMinor: input.amount,
    occurredOn: input.occurredOn,
    description: input.description,
    notes: input.notes,
    walletId: input.walletId,
    toWalletId: input.toWalletId,
    categoryId: input.categoryId,
  };
}

export async function createTransaction(
  db: Db,
  userId: string,
  input: TransactionInput,
  source: "manual" | "nl" | "onboarding" = "manual",
) {
  await assertEntryReferences(db, userId, input);
  await assertDailyRoomFor(db, userId, "entriesPerDay");
  const [row] = await db
    .insert(transaction)
    .values({ ...toRow(input), userId, source })
    .returning();
  await learnFromEntry(db, userId, input.description, input.categoryId);
  return row;
}

export async function updateTransaction(db: Db, userId: string, id: string, input: TransactionInput) {
  const existing = await getOwnedTransaction(db, userId, id);
  await assertEntryReferences(db, userId, input, existing);
  const [row] = await db
    .update(transaction)
    .set(toRow(input))
    .where(and(eq(transaction.id, id), eq(transaction.userId, userId)))
    .returning();
  // Re-categorizing an entry is a correction worth learning from.
  await learnFromEntry(db, userId, input.description, input.categoryId);
  return row;
}

/** Deleted entries newer than this can still be brought back (D-030). */
const keptSince = () => sql`now() - make_interval(mins => ${LIMITS.undoDeleteMinutes})`;

/**
 * Deletes an entry, keeping a copy for a few minutes so "Undo" can bring it
 * back (restoreTransaction). The user's expired copies go at the same time.
 */
export async function deleteTransaction(db: Db, userId: string, id: string) {
  const row = await getOwnedTransaction(db, userId, id);
  await db.transaction(async (tx) => {
    await tx
      .insert(deletedEntry)
      .values({ id: row.id, userId, row })
      .onConflictDoUpdate({ target: deletedEntry.id, set: { row, deletedAt: sql`now()` } });
    await tx.delete(transaction).where(and(eq(transaction.id, id), eq(transaction.userId, userId)));
    await tx.delete(deletedEntry).where(and(eq(deletedEntry.userId, userId), lt(deletedEntry.deletedAt, keptSince())));
  });
}

/** The copy kept by deleteTransaction, read back (the dates come back from JSON as text). */
const keptEntry = z.object({
  id: z.uuid(),
  userId: z.string(),
  type: z.enum(["income", "expense", "transfer"]),
  amountMinor: z.number().int().positive(),
  occurredOn: z.string(),
  description: z.string(),
  notes: z.string().nullable(),
  merchantKey: z.string().nullable(),
  categoryId: z.uuid().nullable(),
  walletId: z.uuid(),
  toWalletId: z.uuid().nullable(),
  recurringRuleId: z.uuid().nullable(),
  recurrenceOn: z.string().nullable(),
  source: z.enum(["manual", "nl", "recurring", "onboarding"]),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

/**
 * Brings back an entry deleted in the last few minutes, as it was: same id,
 * same date added (so it doesn't count again against the daily limit). Another
 * user's or an expired one is refused as if it didn't exist. A wallet deleted
 * since refuses it; a category or recurring item deleted since is let go, as
 * deleting it would have done. Archived ones are fine, as when editing.
 */
export async function restoreTransaction(db: Db, userId: string, id: string) {
  await db.transaction(async (tx) => {
    const [kept] = await tx
      .delete(deletedEntry)
      .where(and(eq(deletedEntry.id, id), eq(deletedEntry.userId, userId), gte(deletedEntry.deletedAt, keptSince())))
      .returning({ row: deletedEntry.row });
    const entry = kept && keptEntry.parse(kept.row);
    if (!entry || entry.userId !== userId) throw new UserError("That entry doesn't exist.");

    for (const walletId of [entry.walletId, entry.toWalletId]) {
      if (!walletId) continue;
      await getOwnedWallet(tx, userId, walletId).catch((err: unknown) => {
        if (err instanceof UserError) throw new UserError("Its wallet was deleted, so this entry can't come back.");
        throw err;
      });
    }
    const stillThere = async (table: typeof category | typeof recurringRule, rowId: string | null) =>
      rowId !== null &&
      (
        await tx
          .select({ id: table.id })
          .from(table)
          .where(and(eq(table.id, rowId), eq(table.userId, userId)))
      ).length > 0;
    const categoryId = (await stillThere(category, entry.categoryId)) ? entry.categoryId : null;
    const recurringRuleId = (await stillThere(recurringRule, entry.recurringRuleId)) ? entry.recurringRuleId : null;

    await tx
      .insert(transaction)
      .values({ ...entry, categoryId, recurringRuleId, recurrenceOn: recurringRuleId ? entry.recurrenceOn : null })
      .catch(
        rethrowUnique(
          "transaction_rule_occurrence_key",
          "This was recorded again since, so there's nothing to bring back.",
        ),
      );
  });
}

/** Removes every user's deleted entries that can no longer be brought back (the daily job). */
export async function pruneDeletedEntries(db: Db): Promise<number> {
  const gone = await db
    .delete(deletedEntry)
    .where(lt(deletedEntry.deletedAt, keptSince()))
    .returning({ id: deletedEntry.id });
  return gone.length;
}
