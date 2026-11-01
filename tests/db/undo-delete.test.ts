// "Undo" after deleting an entry (D-030): the entry comes back as it was for a
// few minutes, only for its owner, and the copies don't pile up.
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/server/db/schema";
import { seedNewUser } from "@/server/db/seed-defaults";
import { createCategory, deleteCategory, listCategories } from "@/server/services/categories";
import { UserError } from "@/server/services/errors";
import { createRule, deleteRule } from "@/server/services/recurring";
import {
  createTransaction,
  deleteTransaction,
  pruneDeletedEntries,
  restoreTransaction,
} from "@/server/services/transactions";
import { createWallet, deleteWallet, listWallets } from "@/server/services/wallets";
import { createTestDb, createTestUser, freeCategoryColor } from "./helpers";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

async function newUser() {
  const u = await createTestUser(t.db);
  await seedNewUser(t.db, u.id);
  const [cash] = await listWallets(t.db, u.id);
  return { id: u.id, cashId: cash.id };
}
const spend = (userId: string, walletId: string, over: Partial<Parameters<typeof createTransaction>[2]> = {}) =>
  createTransaction(t.db, userId, {
    type: "expense",
    amount: 250_00,
    occurredOn: "2026-10-20",
    description: "Chai and samosa",
    notes: null,
    walletId,
    toWalletId: null,
    categoryId: null,
    ...over,
  });
const entryRow = async (id: string) =>
  (await t.db.select().from(schema.transaction).where(eq(schema.transaction.id, id)))[0];
const refusal = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (err: unknown) => (err instanceof UserError ? err.message : err),
  );
/** Makes a kept copy look older than the undo window. */
const age = (id: string, minutes: number) =>
  t.db
    .update(schema.deletedEntry)
    .set({ deletedAt: sql`now() - make_interval(mins => ${minutes})` })
    .where(eq(schema.deletedEntry.id, id));

describe("undo after deleting an entry", () => {
  it("brings it back exactly as it was: same id, date added and source, and the balance", async () => {
    const u = await newUser();
    const entry = await spend(u.id, u.cashId);
    const before = await entryRow(entry.id);
    const balance = async () => (await listWallets(t.db, u.id))[0].balanceMinor;
    const spent = await balance();

    await deleteTransaction(t.db, u.id, entry.id);
    expect(await entryRow(entry.id)).toBeUndefined();
    expect(await balance()).toBe(spent + 250_00);

    await restoreTransaction(t.db, u.id, entry.id);
    expect(await entryRow(entry.id)).toEqual(before);
    expect(await balance()).toBe(spent);
    // The copy is used up: a second undo has nothing to bring back.
    expect(await refusal(restoreTransaction(t.db, u.id, entry.id))).toBe("That entry doesn't exist.");
    // And it can be deleted again.
    await deleteTransaction(t.db, u.id, entry.id);
    await restoreTransaction(t.db, u.id, entry.id);
    expect(await entryRow(entry.id)).toBeDefined();
  });

  it("refuses another user's entry and an expired one as if they didn't exist", async () => {
    const u = await newUser();
    const other = await newUser();
    const mine = await spend(u.id, u.cashId);
    await deleteTransaction(t.db, u.id, mine.id);
    expect(await refusal(restoreTransaction(t.db, other.id, mine.id))).toBe("That entry doesn't exist.");

    await age(mine.id, 11);
    expect(await refusal(restoreTransaction(t.db, u.id, mine.id))).toBe("That entry doesn't exist.");
    expect(await entryRow(mine.id)).toBeUndefined();
  });

  it("can't bring it back once its wallet is deleted; lets go of a category deleted since", async () => {
    const u = await newUser();
    const bank = await createWallet(t.db, u.id, {
      name: "Bank",
      kind: "bank",
      color: "#4a7fc1",
      openingBalanceMinor: 0,
    });
    const pets = await createCategory(t.db, u.id, {
      name: "Pets",
      kind: "expense",
      icon: "paw-print",
      color: await freeCategoryColor(t.db, u.id, "expense"),
    });
    const onBank = await spend(u.id, bank.id);
    const petFood = await spend(u.id, u.cashId, { categoryId: pets.id, description: "Pet food" });

    await deleteTransaction(t.db, u.id, onBank.id);
    await deleteWallet(t.db, u.id, bank.id); // it has no entries now, so it can go
    expect(await refusal(restoreTransaction(t.db, u.id, onBank.id))).toBe(
      "Its wallet was deleted, so this entry can't come back.",
    );

    await deleteTransaction(t.db, u.id, petFood.id);
    await deleteCategory(t.db, u.id, pets.id);
    await restoreTransaction(t.db, u.id, petFood.id);
    expect(await entryRow(petFood.id)).toMatchObject({ description: "Pet food", categoryId: null });
    expect((await listCategories(t.db, u.id)).some((c) => c.name === "Pets")).toBe(false);
  });

  it("lets go of a recurring item deleted since, and says so if the occurrence was recorded again", async () => {
    const u = await newUser();
    const rule = await createRule(
      t.db,
      u.id,
      {
        type: "expense",
        amount: 300_00,
        description: "Rent",
        walletId: u.cashId,
        toWalletId: null,
        categoryId: null,
        frequency: "monthly",
        interval: 1,
        anchorDate: "2026-11-01",
        endDate: null,
        mode: "confirm",
        isSubscription: false,
      },
      "2026-10-25",
    );
    const occurrence = (id?: string) =>
      t.db
        .insert(schema.transaction)
        .values({
          ...(id && { id }),
          userId: u.id,
          type: "expense",
          amountMinor: 300_00,
          occurredOn: "2026-11-01",
          description: "Rent",
          walletId: u.cashId,
          recurringRuleId: rule.id,
          recurrenceOn: "2026-11-01",
          source: "recurring",
        })
        .returning();
    const [recorded] = await occurrence();
    await deleteTransaction(t.db, u.id, recorded.id);
    await occurrence(); // recorded again for the same date
    expect(await refusal(restoreTransaction(t.db, u.id, recorded.id))).toBe(
      "This was recorded again since, so there's nothing to bring back.",
    );

    // Once the recurring item itself is gone, the entry comes back on its own.
    await t.db
      .delete(schema.transaction)
      .where(and(eq(schema.transaction.userId, u.id), eq(schema.transaction.recurringRuleId, rule.id)));
    await deleteRule(t.db, u.id, rule.id);
    await restoreTransaction(t.db, u.id, recorded.id);
    expect(await entryRow(recorded.id)).toMatchObject({
      recurringRuleId: null,
      recurrenceOn: null,
      source: "recurring",
    });
  });

  it("doesn't keep copies around: expired ones go on the next delete and in the daily job", async () => {
    const u = await newUser();
    const other = await newUser();
    const old = await spend(u.id, u.cashId);
    const theirs = await spend(other.id, other.cashId);
    const fresh = await spend(u.id, u.cashId);
    await deleteTransaction(t.db, u.id, old.id);
    await deleteTransaction(t.db, other.id, theirs.id);
    await age(old.id, 30);
    await age(theirs.id, 30);

    await deleteTransaction(t.db, u.id, fresh.id); // takes the user's own expired copy with it
    const kept = async (id: string) => t.db.$count(schema.deletedEntry, eq(schema.deletedEntry.id, id));
    expect(await kept(old.id)).toBe(0);
    expect(await kept(theirs.id)).toBe(1); // someone else's, left for the job
    expect(await kept(fresh.id)).toBe(1);

    expect(await pruneDeletedEntries(t.db)).toBeGreaterThanOrEqual(1);
    expect(await kept(theirs.id)).toBe(0);
    expect(await kept(fresh.id)).toBe(1); // still within the window
  });
});
