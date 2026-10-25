import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { TransactionInput } from "@/lib/validation";
import { category, transaction, user, wallet } from "@/server/db/schema";
import { seedNewUser } from "@/server/db/seed-defaults";
import { archiveCategory, deleteCategory, listCategories } from "@/server/services/categories";
import { UserError } from "@/server/services/errors";
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  summarizeTransactions,
  updateTransaction,
} from "@/server/services/transactions";
import { archiveWallet, createWallet, deleteWallet, listWallets } from "@/server/services/wallets";
import { createTestDb, createTestUser } from "./helpers";

type T = Awaited<ReturnType<typeof createTestDb>>;

async function setupUser(t: T) {
  const u = await createTestUser(t.db);
  await seedNewUser(t.db, u.id);
  const cats = await listCategories(t.db, u.id);
  const [cash] = await listWallets(t.db, u.id);
  const bank = await createWallet(t.db, u.id, {
    name: "SBI Debit",
    kind: "bank",
    color: "#4a7fc1",
    openingBalanceMinor: 1_000_00,
  });
  const card = await createWallet(t.db, u.id, {
    name: "ICICI Credit Card",
    kind: "credit_card",
    color: "#8a64b8",
    openingBalanceMinor: -500_00,
  });
  return {
    user: u,
    cash,
    bank,
    card,
    groceries: cats.find((c) => c.name === "Groceries")!,
    salary: cats.find((c) => c.name === "Salary")!,
  };
}

const entry = (over: Partial<TransactionInput> & Pick<TransactionInput, "walletId">): TransactionInput => ({
  type: "expense",
  amount: 100_00,
  occurredOn: "2026-10-20",
  description: "",
  notes: null,
  toWalletId: null,
  categoryId: null,
  ...over,
});

const balanceOf = async (t: T, userId: string, walletId: string) =>
  (await listWallets(t.db, userId, { includeArchived: true })).find((w) => w.id === walletId)!.balanceMinor;

describe("wallets and transactions", () => {
  let t: T;
  beforeAll(async () => {
    t = await createTestDb();
  });
  afterAll(() => t.close());

  it("gives new users a default Cash wallet, once", async () => {
    const u = await createTestUser(t.db);
    await seedNewUser(t.db, u.id);
    await seedNewUser(t.db, u.id);
    const wallets = await listWallets(t.db, u.id);
    expect(wallets.map((w) => w.name)).toEqual(["Cash"]);
    const [row] = await t.db.select().from(user).where(eq(user.id, u.id));
    expect(row.defaultWalletId).toBe(wallets[0].id);
  });

  it("computes balances from opening balance, income, spending and transfers", async () => {
    const s = await setupUser(t);
    await createTransaction(
      t.db,
      s.user.id,
      entry({ type: "income", amount: 42_000_00, walletId: s.bank.id, categoryId: s.salary.id }),
    );
    await createTransaction(
      t.db,
      s.user.id,
      entry({ amount: 2_380_00, walletId: s.bank.id, categoryId: s.groceries.id }),
    );
    await createTransaction(t.db, s.user.id, entry({ amount: 1_150_00, walletId: s.card.id }));
    // Pay the card bill from the bank: moves money, isn't spending.
    await createTransaction(
      t.db,
      s.user.id,
      entry({ type: "transfer", amount: 1_650_00, walletId: s.bank.id, toWalletId: s.card.id }),
    );

    expect(await balanceOf(t, s.user.id, s.bank.id)).toBe(1_000_00 + 42_000_00 - 2_380_00 - 1_650_00);
    expect(await balanceOf(t, s.user.id, s.card.id)).toBe(-500_00 - 1_150_00 + 1_650_00);
    expect(await balanceOf(t, s.user.id, s.cash.id)).toBe(0);

    const summary = await summarizeTransactions(t.db, s.user.id, { from: "2026-10-01", to: "2026-11-01" });
    expect(summary.incomeMinor).toBe(42_000_00);
    expect(summary.expenseMinor).toBe(2_380_00 + 1_150_00); // transfer excluded
  });

  it("filters the list by month, wallet, category, type and search text", async () => {
    const s = await setupUser(t);
    await createTransaction(
      t.db,
      s.user.id,
      entry({ walletId: s.bank.id, categoryId: s.groceries.id, description: "Big Bazaar 50% off" }),
    );
    await createTransaction(
      t.db,
      s.user.id,
      entry({ walletId: s.cash.id, occurredOn: "2026-09-30", description: "Chai" }),
    );
    await createTransaction(t.db, s.user.id, entry({ type: "transfer", walletId: s.bank.id, toWalletId: s.cash.id }));

    const oct = { from: "2026-10-01", to: "2026-11-01" };
    expect(await listTransactions(t.db, s.user.id, oct)).toHaveLength(2);
    expect(await listTransactions(t.db, s.user.id, { ...oct, walletId: s.cash.id })).toHaveLength(1); // incoming transfer
    expect(await listTransactions(t.db, s.user.id, { categoryId: s.groceries.id })).toHaveLength(1);
    expect(await listTransactions(t.db, s.user.id, { categoryId: "none" })).toHaveLength(1); // Chai; transfers excluded
    expect(await listTransactions(t.db, s.user.id, { type: "transfer" })).toHaveLength(1);
    expect(await listTransactions(t.db, s.user.id, { q: "50%" })).toHaveLength(1); // % is literal, not a wildcard
    expect(await listTransactions(t.db, s.user.id, { q: "%" })).toHaveLength(1);

    const [row] = await listTransactions(t.db, s.user.id, { q: "bazaar" });
    expect(row).toMatchObject({ walletName: "SBI Debit", categoryName: "Groceries", categoryIcon: "shopping-basket" });
  });

  it("never lets one user touch another user's wallets, categories or entries", async () => {
    const a = await setupUser(t);
    const b = await setupUser(t);
    const aEntry = await createTransaction(t.db, a.user.id, entry({ walletId: a.bank.id }));

    await expect(createTransaction(t.db, b.user.id, entry({ walletId: a.bank.id }))).rejects.toThrow(UserError);
    await expect(
      createTransaction(t.db, b.user.id, entry({ type: "transfer", walletId: b.bank.id, toWalletId: a.bank.id })),
    ).rejects.toThrow(UserError);
    await expect(
      createTransaction(t.db, b.user.id, entry({ walletId: b.bank.id, categoryId: a.groceries.id })),
    ).rejects.toThrow(UserError);
    await expect(updateTransaction(t.db, b.user.id, aEntry.id, entry({ walletId: b.bank.id }))).rejects.toThrow(
      UserError,
    );
    await expect(deleteTransaction(t.db, b.user.id, aEntry.id)).rejects.toThrow(UserError);
    await expect(archiveWallet(t.db, b.user.id, a.bank.id)).rejects.toThrow(UserError);
    await expect(deleteCategory(t.db, b.user.id, a.groceries.id)).rejects.toThrow(UserError);

    expect(await listTransactions(t.db, b.user.id)).toHaveLength(0);
    expect(await listTransactions(t.db, a.user.id)).toHaveLength(1);
  });

  it("rejects a category of the wrong kind", async () => {
    const s = await setupUser(t);
    await expect(
      createTransaction(t.db, s.user.id, entry({ walletId: s.bank.id, categoryId: s.salary.id })),
    ).rejects.toThrow(/income category/);
  });

  it("keeps archived wallets and categories out of new entries but lets old entries keep them", async () => {
    const s = await setupUser(t);
    const old = await createTransaction(t.db, s.user.id, entry({ walletId: s.cash.id, categoryId: s.groceries.id }));
    await archiveWallet(t.db, s.user.id, s.cash.id);
    await archiveCategory(t.db, s.user.id, s.groceries.id);

    await expect(createTransaction(t.db, s.user.id, entry({ walletId: s.cash.id }))).rejects.toThrow(/archived/);
    await expect(
      createTransaction(t.db, s.user.id, entry({ walletId: s.bank.id, categoryId: s.groceries.id })),
    ).rejects.toThrow(/archived/);
    // Editing the amount of an existing entry is still fine.
    await updateTransaction(
      t.db,
      s.user.id,
      old.id,
      entry({ walletId: s.cash.id, categoryId: s.groceries.id, amount: 5_00 }),
    );

    const [row] = await t.db.select().from(user).where(eq(user.id, s.user.id));
    expect(row.defaultWalletId).toBeNull(); // archiving the default clears it
    expect((await listWallets(t.db, s.user.id)).map((w) => w.name)).not.toContain("Cash");
  });

  it("deletes unused wallets and categories but refuses used ones", async () => {
    const s = await setupUser(t);
    await createTransaction(t.db, s.user.id, entry({ type: "transfer", walletId: s.bank.id, toWalletId: s.card.id }));
    await expect(deleteWallet(t.db, s.user.id, s.card.id)).rejects.toThrow(/archived/);
    await deleteWallet(t.db, s.user.id, s.cash.id);
    expect((await listWallets(t.db, s.user.id)).map((w) => w.name)).toEqual(["SBI Debit", "ICICI Credit Card"]);
  });

  it("rejects duplicate wallet names, ignoring case", async () => {
    const s = await setupUser(t);
    await expect(
      createWallet(t.db, s.user.id, { name: "sbi debit", kind: "bank", color: "#4a7fc1", openingBalanceMinor: 0 }),
    ).rejects.toThrow(/already have a wallet/);
  });

  it("enforces transfer shape and positive amounts in the database itself", async () => {
    const s = await setupUser(t);
    const base = { userId: s.user.id, occurredOn: "2026-10-20", walletId: s.bank.id };
    await expect(t.db.insert(transaction).values({ ...base, type: "transfer", amountMinor: 100 })).rejects.toThrow();
    await expect(
      t.db.insert(transaction).values({ ...base, type: "transfer", amountMinor: 100, toWalletId: s.bank.id }),
    ).rejects.toThrow();
    await expect(t.db.insert(transaction).values({ ...base, type: "expense", amountMinor: 0 })).rejects.toThrow();
  });

  it("deletes everything when a user account is deleted", async () => {
    const s = await setupUser(t);
    await createTransaction(t.db, s.user.id, entry({ type: "transfer", walletId: s.bank.id, toWalletId: s.card.id }));
    await t.db.delete(user).where(eq(user.id, s.user.id));
    expect(await t.db.select().from(wallet).where(eq(wallet.userId, s.user.id))).toHaveLength(0);
    expect(await t.db.select().from(category).where(eq(category.userId, s.user.id))).toHaveLength(0);
    expect(await t.db.select().from(transaction).where(eq(transaction.userId, s.user.id))).toHaveLength(0);
  });
});

describe("usage counts", () => {
  it("counts entries per category and per wallet correctly", async () => {
    const t = await createTestDb();
    const s = await setupUser(t);
    await createTransaction(t.db, s.user.id, entry({ walletId: s.bank.id, categoryId: s.groceries.id }));
    await createTransaction(t.db, s.user.id, entry({ walletId: s.bank.id, categoryId: s.groceries.id }));
    await createTransaction(t.db, s.user.id, entry({ type: "transfer", walletId: s.bank.id, toWalletId: s.cash.id }));

    const cats = await listCategories(t.db, s.user.id);
    expect(cats.find((c) => c.id === s.groceries.id)!.usage).toBe(2);
    expect(cats.find((c) => c.id === s.salary.id)!.usage).toBe(0);

    const wallets = await listWallets(t.db, s.user.id);
    expect(Object.fromEntries(wallets.map((w) => [w.name, w.entryCount]))).toEqual({
      Cash: 1,
      "SBI Debit": 3,
      "ICICI Credit Card": 0,
    });
    await t.close();
  });
});
