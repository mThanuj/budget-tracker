import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { takeChatQuota } from "@/server/ai/quota";
import { seedNewUser } from "@/server/db/seed-defaults";
import * as schema from "@/server/db/schema";
import { deleteAccountData, entriesCsv } from "@/server/services/account";
import { adminStats } from "@/server/services/admin-stats";
import { createBudget } from "@/server/services/budgets";
import { listCategories } from "@/server/services/categories";
import { addContribution, createGoal } from "@/server/services/goals";
import { createRule } from "@/server/services/recurring";
import { createTransaction } from "@/server/services/transactions";
import { createWallet, listWallets } from "@/server/services/wallets";
import { createTestDb, createTestUser } from "./helpers";

const today = "2026-10-24";

describe("account data", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let alice: string;
  let bob: string;

  async function fill(userId: string) {
    await seedNewUser(t.db, userId);
    const [cash] = await listWallets(t.db, userId);
    const sbi = await createWallet(t.db, userId, { name: "SBI", kind: "bank", color: "#4a7fc1", openingBalanceMinor: 5_000_00 });
    const groceries = (await listCategories(t.db, userId)).find((c) => c.name === "Groceries")!;
    await createTransaction(t.db, userId, {
      type: "expense", amount: 1_250_50, occurredOn: "2026-10-02", description: "Big Bazaar, Ameerpet", notes: "=1+1",
      walletId: cash.id, toWalletId: null, categoryId: groceries.id,
    });
    await createTransaction(t.db, userId, {
      type: "transfer", amount: 500_00, occurredOn: "2026-10-01", description: "ATM", notes: null,
      walletId: sbi.id, toWalletId: cash.id, categoryId: null,
    });
    await createBudget(t.db, userId, { categoryId: null, amount: 20_000_00, rollover: false }, "2026-10");
    const goal = await createGoal(t.db, userId, { name: "Phone", target: 10_000_00, targetDate: null, icon: "smartphone", color: "#4a7fc1" });
    await addContribution(t.db, userId, goal.id, { direction: "add", amount: 1_000_00, occurredOn: today, note: null });
    await createRule(t.db, userId, {
      type: "expense", amount: 499_00, description: "Gym", walletId: sbi.id, toWalletId: null, categoryId: null,
      frequency: "monthly", interval: 1, anchorDate: "2026-10-28", endDate: null, mode: "auto", isSubscription: true,
    }, today);
    await t.db.insert(schema.subscription).values({
      userId, razorpaySubscriptionId: `sub_${userId}`, planKey: "yearly", status: "active", currentEnd: new Date("2027-10-01T00:00:00Z"),
    });
    await takeChatQuota(t.db, userId, { userDaily: 50, chatDaily: 10, globalDaily: 100 }, new Date(`${today}T10:00:00Z`));
  }

  beforeAll(async () => {
    t = await createTestDb();
    alice = (await createTestUser(t.db, { name: "Alice" })).id;
    bob = (await createTestUser(t.db, { name: "Bob" })).id;
    await fill(alice);
    await fill(bob);
  });
  afterAll(() => t.close());

  it("exports every entry, oldest first, ready for a spreadsheet", async () => {
    const csv = await entriesCsv(t.db, alice, "INR");
    expect(csv.startsWith("\uFEFFDate,Type,Amount,Currency,")).toBe(true); // BOM so Excel reads UTF-8
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe("2026-10-01,Transfer,500.00,INR,ATM,,SBI,Cash,,manual");
    expect(lines[2]).toBe('2026-10-02,Expense,1250.50,INR,"Big Bazaar, Ameerpet",Groceries,Cash,,\'=1+1,manual');
  });

  it("counts users, Pro and AI use for the admin page", async () => {
    const s = await adminStats(t.db, new Date(`${today}T12:00:00Z`));
    expect(s.users).toMatchObject({ total: 2 });
    expect(s.pro).toMatchObject({ total: 2, yearly: 2, monthly: 0, mrrMinor: Math.round((2 * 799_00) / 12), doubleBilled: 0 });
    expect(s.aiByDay[0]).toMatchObject({ day: today, requests: 2, chat: 2 });
  });

  it("deletes one user's everything and nobody else's", async () => {
    await deleteAccountData(t.db, alice);
    for (const table of [schema.wallet, schema.transaction, schema.category, schema.budget, schema.goal, schema.recurringRule, schema.subscription]) {
      const rows = await t.db.select().from(table);
      expect(rows.every((r) => (r as { userId: string }).userId === bob), `only Bob left in ${table}`).toBe(true);
      expect(rows.length).toBeGreaterThan(0);
    }
    expect(await t.db.select().from(schema.goalContribution)).toHaveLength(1);
    expect(await t.db.select().from(schema.aiUsage).where(like(schema.aiUsage.scope, "user:%"))).toEqual([
      expect.objectContaining({ scope: `user:${bob}` }),
    ]);
    expect(await t.db.select().from(schema.user).where(eq(schema.user.id, alice))).toHaveLength(0);
  });
});
