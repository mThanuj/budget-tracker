import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupSchema } from "@/lib/validation";
import { budget, goal, recurringRule, transaction, wallet } from "@/server/db/schema";
import { seedNewUser } from "@/server/db/seed-defaults";
import { createBudget, getBudgetOverview } from "@/server/services/budgets";
import { listCategories } from "@/server/services/categories";
import { applySetup, firstMonthlyDate } from "@/server/services/setup";
import { listWallets } from "@/server/services/wallets";
import { createTestDb, createTestUser } from "./helpers";

const today = "2026-10-24";

describe("firstMonthlyDate", () => {
  it("is always after today", () => {
    expect(firstMonthlyDate(1, today)).toBe("2026-11-01");
    expect(firstMonthlyDate(24, today)).toBe("2026-11-24"); // today: next month, not now
    expect(firstMonthlyDate(28, today)).toBe("2026-10-28");
    expect(firstMonthlyDate(null, today)).toBe("2026-11-24");
    expect(firstMonthlyDate(31, "2026-01-31")).toBe("2026-02-28");
  });
});

describe("applySetup", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => {
    t = await createTestDb();
  });
  afterAll(() => t.close());

  async function newUser() {
    const u = await createTestUser(t.db);
    await seedNewUser(t.db, u.id);
    const cats = Object.fromEntries((await listCategories(t.db, u.id)).map((c) => [c.name, c.id]));
    return { userId: u.id, cats };
  }

  const payload = (cats: Record<string, string>) =>
    setupSchema("INR", today).parse({
      wallets: [
        { name: "SBI Savings", kind: "bank", balance: "20,000" },
        { name: "ICICI Credit Card", kind: "credit_card", balance: "3000" },
        { name: "cash", kind: "cash", balance: "2000" },
      ],
      incomes: [{ name: "Salary", amount: "42000", day: "1" }],
      bills: [
        { name: "Rent", amount: "15000", day: "5", subscription: false, categoryId: cats["Rent & Housing"] },
        { name: "Netflix", amount: "649", day: "", subscription: true, categoryId: null },
      ],
      goals: [{ name: "New phone", target: "60000", by: "2027-03-31" }],
      incomeWallet: "SBI Savings",
      billsWallet: "SBI Savings",
      limit: "33500",
      categoryBudgets: [{ categoryId: cats.Groceries, amount: "6200" }],
    });

  it("creates the reviewed wallets, recurring items, budgets and goals without recording anything today", async () => {
    const s = await newUser();
    const counts = await applySetup(t.db, s.userId, payload(s.cats), today);
    expect(counts).toEqual({ wallets: 2, recurring: 3, budgets: 2, goals: 1 });

    const wallets = Object.fromEntries((await listWallets(t.db, s.userId)).map((w) => [w.name, w.balanceMinor]));
    // The existing Cash wallet got its balance instead of a duplicate; cards store what's owed as negative.
    expect(wallets).toEqual({ Cash: 2_000_00, "SBI Savings": 20_000_00, "ICICI Credit Card": -3_000_00 });

    const rules = await t.db.select().from(recurringRule).where(eq(recurringRule.userId, s.userId));
    expect(Object.fromEntries(rules.map((r) => [r.description, [r.nextDueOn, r.isSubscription]]))).toEqual({
      Salary: ["2026-11-01", false],
      Rent: ["2026-11-05", false],
      Netflix: ["2026-11-24", true],
    });
    expect(rules.find((r) => r.description === "Netflix")?.categoryId).toBe(s.cats.Subscriptions);
    expect(rules.find((r) => r.description === "Salary")?.categoryId).toBe(s.cats.Salary);
    expect(await t.db.select().from(transaction).where(eq(transaction.userId, s.userId))).toHaveLength(0);

    const overview = await getBudgetOverview(t.db, s.userId, "2026-10");
    expect(overview.overall?.amountMinor).toBe(33_500_00);
    expect(overview.categories.map((b) => [b.categoryName, b.amountMinor])).toEqual([["Groceries", 6_200_00]]);
    expect(await t.db.select().from(goal).where(eq(goal.userId, s.userId))).toHaveLength(1);
  });

  it("keeps budgets the user already has when run again", async () => {
    const s = await newUser();
    await createBudget(t.db, s.userId, { categoryId: s.cats.Groceries, amount: 9_000_00, rollover: false }, "2026-10");
    await applySetup(t.db, s.userId, payload(s.cats), today);
    const rows = await t.db.select().from(budget).where(eq(budget.categoryId, s.cats.Groceries));
    expect(rows.map((r) => r.amountMinor)).toEqual([9_000_00]);
  });

  it("rolls everything back if any part fails", async () => {
    const s = await newUser();
    const other = await newUser();
    const bad = payload(s.cats);
    bad.categoryBudgets = [{ categoryId: other.cats.Groceries, amount: 100_00 }]; // someone else's category
    await expect(applySetup(t.db, s.userId, bad, today)).rejects.toThrow();
    expect(await t.db.select().from(wallet).where(eq(wallet.userId, s.userId))).toHaveLength(1); // only Cash
    expect(await t.db.select().from(recurringRule).where(eq(recurringRule.userId, s.userId))).toHaveLength(0);
  });
});
