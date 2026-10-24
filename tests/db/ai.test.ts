import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { suggestCategory } from "@/server/ai";
import { takeAiQuota } from "@/server/ai/quota";
import { transaction } from "@/server/db/schema";
import { seedNewUser } from "@/server/db/seed-defaults";
import { archiveCategory, listCategories } from "@/server/services/categories";
import { learnedCategory } from "@/server/services/merchant-rules";
import { createTransaction, updateTransaction } from "@/server/services/transactions";
import { listWallets } from "@/server/services/wallets";
import { createTestDb, createTestUser } from "./helpers";

type T = Awaited<ReturnType<typeof createTestDb>>;

async function setup(t: T) {
  const u = await createTestUser(t.db);
  await seedNewUser(t.db, u.id);
  const [cash] = await listWallets(t.db, u.id);
  const cats = Object.fromEntries((await listCategories(t.db, u.id)).map((c) => [c.name, c.id]));
  const spend = (description: string, categoryId: string | null) =>
    createTransaction(t.db, u.id, {
      type: "expense", amount: 100_00, occurredOn: "2026-10-20", description, notes: null,
      walletId: cash.id, toWalletId: null, categoryId,
    });
  return { user: u, cash, cats, spend };
}

describe("learning categories from entries", () => {
  let t: T;
  beforeAll(async () => {
    t = await createTestDb();
  });
  afterAll(() => t.close());

  it("remembers the category for a merchant, however it's written", async () => {
    const s = await setup(t);
    const e = await s.spend("Big Bazaar", s.cats.Groceries);
    const [row] = await t.db.select().from(transaction).where(eq(transaction.id, e.id));
    expect(row.merchantKey).toBe("big bazaar");
    expect(await learnedCategory(t.db, s.user.id, "BIG BAZAAR #123", "expense")).toBe(s.cats.Groceries);
    expect(await learnedCategory(t.db, s.user.id, "Big Bazaar", "income")).toBeNull(); // wrong kind
  });

  it("learns from corrections and ignores archived categories", async () => {
    const s = await setup(t);
    const e = await s.spend("Swiggy", s.cats.Groceries);
    await updateTransaction(t.db, s.user.id, e.id, {
      type: "expense", amount: 100_00, occurredOn: "2026-10-20", description: "Swiggy", notes: null,
      walletId: s.cash.id, toWalletId: null, categoryId: s.cats["Dining Out"],
    });
    expect(await learnedCategory(t.db, s.user.id, "swiggy order", "expense")).toBe(s.cats["Dining Out"]);
    await archiveCategory(t.db, s.user.id, s.cats["Dining Out"]);
    expect(await learnedCategory(t.db, s.user.id, "Swiggy", "expense")).toBeNull();
  });

  it("keeps each user's rules private", async () => {
    const a = await setup(t);
    const b = await setup(t);
    await a.spend("Zomato", a.cats["Dining Out"]);
    expect(await learnedCategory(t.db, b.user.id, "Zomato", "expense")).toBeNull();
  });

  it("suggests learned categories even without an AI provider", async () => {
    const s = await setup(t);
    await s.spend("Netflix", s.cats.Subscriptions);
    expect(await suggestCategory(t.db, s.user, { description: "NETFLIX.COM", type: "expense" })).toEqual({
      categoryId: s.cats.Subscriptions,
      source: "learned",
    });
    // Unknown merchant and no provider configured in tests: no suggestion, no error.
    expect(await suggestCategory(t.db, s.user, { description: "Mystery shop", type: "expense" })).toBeNull();
  });
});

describe("AI quota", () => {
  it("enforces per-user and global daily limits, resetting each day", async () => {
    const t = await createTestDb();
    const a = await createTestUser(t.db);
    const b = await createTestUser(t.db);
    const limits = { userDaily: 2, globalDaily: 3 };
    const day1 = new Date("2026-10-24T10:00:00Z");

    expect(await takeAiQuota(t.db, a.id, limits, day1)).toBe(true);
    expect(await takeAiQuota(t.db, a.id, limits, day1)).toBe(true);
    expect(await takeAiQuota(t.db, a.id, limits, day1)).toBe(false); // a's 3rd today
    expect(await takeAiQuota(t.db, b.id, limits, day1)).toBe(true); // global 3rd
    expect(await takeAiQuota(t.db, b.id, limits, day1)).toBe(false); // global used up

    expect(await takeAiQuota(t.db, a.id, limits, new Date("2026-10-25T10:00:00Z"))).toBe(true);
    await t.close();
  });
});
