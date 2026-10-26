import { and, asc, eq, getTableColumns, isNull, sql } from "drizzle-orm";
import type { WalletInput } from "@/lib/validation";
import { DEFAULT_WALLET_COLOR } from "@/lib/wallets";
import type { Db } from "../db";
import { recurringRule, transaction, user, wallet } from "../db/schema";
import { UserError } from "./errors";
import { assertRoomFor } from "./limits";

// Drizzle leaves single-table columns unqualified, which a correlated subquery
// would resolve against its own table. Spell out the outer reference.
const W_ID = sql.raw(`"wallet"."id"`);
const W_USER = sql.raw(`"wallet"."user_id"`);

/** Wallets with live balances: opening balance plus every entry in or out. */
export async function listWallets(db: Db, userId: string, { includeArchived = false } = {}) {
  return db
    .select({
      ...getTableColumns(wallet),
      balanceMinor: sql<number>`${wallet.openingBalanceMinor} + coalesce((
        select sum(case
          when t.type = 'income' then t.amount_minor
          when t.type = 'expense' then -t.amount_minor
          when t.type = 'transfer' and t.wallet_id = ${W_ID} then -t.amount_minor
          when t.type = 'transfer' and t.to_wallet_id = ${W_ID} then t.amount_minor
          else 0 end)
        from "transaction" t
        where t.user_id = ${W_USER}
          and (t.wallet_id = ${W_ID} or t.to_wallet_id = ${W_ID})
      ), 0)`.mapWith(Number),
      entryCount: sql<number>`(
        select count(*) from "transaction" t
        where t.wallet_id = ${W_ID} or t.to_wallet_id = ${W_ID}
      )`.mapWith(Number),
    })
    .from(wallet)
    .where(and(eq(wallet.userId, userId), includeArchived ? undefined : isNull(wallet.archivedAt)))
    .orderBy(asc(wallet.createdAt));
}

/** Throws unless the wallet exists and belongs to the user. */
export async function getOwnedWallet(db: Db, userId: string, walletId: string) {
  const [row] = await db
    .select()
    .from(wallet)
    .where(and(eq(wallet.id, walletId), eq(wallet.userId, userId)));
  if (!row) throw new UserError("That wallet doesn't exist.", "walletId");
  return row;
}

function rethrowDuplicate(err: unknown): never {
  if (
    err instanceof Error &&
    /wallet_user_name_key/.test(`${err.message} ${(err as { cause?: Error }).cause?.message ?? ""}`)
  ) {
    throw new UserError("You already have a wallet with that name.", "name");
  }
  throw err;
}

export async function createWallet(db: Db, userId: string, input: WalletInput) {
  await assertRoomFor(db, userId, "wallets");
  const [row] = await db
    .insert(wallet)
    .values({ ...input, userId })
    .returning()
    .catch(rethrowDuplicate);
  // The first wallet becomes the default for quick-add.
  await db
    .update(user)
    .set({ defaultWalletId: row.id })
    .where(and(eq(user.id, userId), isNull(user.defaultWalletId)));
  return row;
}

export async function updateWallet(db: Db, userId: string, walletId: string, input: WalletInput) {
  await getOwnedWallet(db, userId, walletId);
  const [row] = await db
    .update(wallet)
    .set(input)
    .where(and(eq(wallet.id, walletId), eq(wallet.userId, userId)))
    .returning()
    .catch(rethrowDuplicate);
  return row;
}

export async function setDefaultWallet(db: Db, userId: string, walletId: string) {
  const w = await getOwnedWallet(db, userId, walletId);
  if (w.archivedAt) throw new UserError("Restore this wallet before making it the default.");
  await db.update(user).set({ defaultWalletId: walletId }).where(eq(user.id, userId));
}

const usesWallet = (walletId: string) =>
  sql`(${recurringRule.walletId} = ${walletId} or ${recurringRule.toWalletId} = ${walletId})`;

/**
 * Hides a wallet from pickers but keeps its history and balance. Recurring
 * items using it are paused so nothing lands in a closed account.
 */
export async function archiveWallet(db: Db, userId: string, walletId: string) {
  await getOwnedWallet(db, userId, walletId);
  await db
    .update(wallet)
    .set({ archivedAt: new Date() })
    .where(and(eq(wallet.id, walletId), eq(wallet.userId, userId)));
  await db
    .update(recurringRule)
    .set({ active: false })
    .where(and(eq(recurringRule.userId, userId), usesWallet(walletId)));
  await db
    .update(user)
    .set({ defaultWalletId: null })
    .where(and(eq(user.id, userId), eq(user.defaultWalletId, walletId)));
}

export async function restoreWallet(db: Db, userId: string, walletId: string) {
  await getOwnedWallet(db, userId, walletId);
  await db
    .update(wallet)
    .set({ archivedAt: null })
    .where(and(eq(wallet.id, walletId), eq(wallet.userId, userId)));
}

/** Only wallets without entries can be deleted; others are archived instead. */
export async function deleteWallet(db: Db, userId: string, walletId: string) {
  await getOwnedWallet(db, userId, walletId);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(transaction)
    .where(sql`${transaction.walletId} = ${walletId} or ${transaction.toWalletId} = ${walletId}`);
  if (count > 0) {
    throw new UserError("This wallet has entries, so it can only be archived.");
  }
  const [{ rules }] = await db
    .select({ rules: sql<number>`count(*)`.mapWith(Number) })
    .from(recurringRule)
    .where(usesWallet(walletId));
  if (rules > 0) {
    throw new UserError("A recurring item uses this wallet. Change or delete that item first.");
  }
  await db.delete(wallet).where(and(eq(wallet.id, walletId), eq(wallet.userId, userId)));
}

/** Idempotent: gives a user with no wallets a default "Cash" wallet. */
export async function seedDefaultWallet(db: Db, userId: string) {
  const existing = await db.select({ id: wallet.id }).from(wallet).where(eq(wallet.userId, userId)).limit(1);
  if (existing.length > 0) return;
  await createWallet(db, userId, {
    name: "Cash",
    kind: "cash",
    color: DEFAULT_WALLET_COLOR.cash,
    openingBalanceMinor: 0,
  });
}
