// Searching entries across months, by amount (the Entries page's search).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { seedNewUser } from "@/server/db/seed-defaults";
import { createTransaction, listTransactions, summarizeTransactions } from "@/server/services/transactions";
import { listWallets } from "@/server/services/wallets";
import { createTestDb, createTestUser } from "./helpers";

let t: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;
beforeAll(async () => {
  t = await createTestDb();
  const u = await createTestUser(t.db);
  await seedNewUser(t.db, u.id);
  userId = u.id;
  const [cash] = await listWallets(t.db, u.id);
  const entry = (occurredOn: string, description: string, amount: number) =>
    createTransaction(t.db, u.id, {
      type: "expense",
      amount,
      occurredOn,
      description,
      notes: null,
      walletId: cash.id,
      toWalletId: null,
      categoryId: null,
    });
  await entry("2025-11-03", "Plumber", 1_500_00);
  await entry("2026-02-14", "Plumber", 900_00);
  await entry("2026-02-20", "Chai", 20_00);
  await entry("2026-10-01", "Groceries", 2_400_00);
  // Someone else's plumber never shows up.
  const other = await createTestUser(t.db);
  await seedNewUser(t.db, other.id);
  const [theirCash] = await listWallets(t.db, other.id);
  await createTransaction(t.db, other.id, {
    type: "expense",
    amount: 1_000_00,
    occurredOn: "2026-01-05",
    description: "Plumber",
    notes: null,
    walletId: theirCash.id,
    toWalletId: null,
    categoryId: null,
  });
});
afterAll(() => t.close());

const descriptions = async (filters: Parameters<typeof listTransactions>[2]) =>
  (await listTransactions(t.db, userId, filters)).map((r) => `${r.occurredOn} ${r.description}`);

describe("searching entries", () => {
  it("finds a word across every month, newest first, with a count of all matches", async () => {
    expect(await descriptions({ q: "plumb" })).toEqual(["2026-02-14 Plumber", "2025-11-03 Plumber"]);
    expect(await summarizeTransactions(t.db, userId, { q: "plumb" })).toMatchObject({
      count: 2,
      expenseMinor: 2_400_00,
    });
  });

  it("limits to a range of days, both ends included", async () => {
    // The page passes the day after the last one as the (exclusive) end.
    expect(await descriptions({ from: "2026-02-14", to: addDays("2026-02-20", 1) })).toEqual([
      "2026-02-20 Chai",
      "2026-02-14 Plumber",
    ]);
    expect(await descriptions({ from: "2026-02-15" })).toEqual(["2026-10-01 Groceries", "2026-02-20 Chai"]);
  });

  it("limits by amount, both ends included", async () => {
    expect(await descriptions({ minMinor: 900_00, maxMinor: 1_500_00 })).toEqual([
      "2026-02-14 Plumber",
      "2025-11-03 Plumber",
    ]);
    expect(await descriptions({ maxMinor: 20_00 })).toEqual(["2026-02-20 Chai"]);
  });

  it("shows only as many as asked, while the count still covers every match", async () => {
    expect(await listTransactions(t.db, userId, {}, 2)).toHaveLength(2);
    expect((await summarizeTransactions(t.db, userId, {})).count).toBe(4);
  });
});
