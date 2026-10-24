import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TransactionInput } from "@/lib/validation";
import { seedNewUser } from "@/server/db/seed-defaults";
import { buildAlerts, dismissAlert, withoutDismissed } from "@/server/services/alerts";
import {
  averageMonthlySpending,
  createBudget,
  deleteBudget,
  getBudgetOverview,
  unbudgetedCategories,
  updateBudget,
} from "@/server/services/budgets";
import { listCategories } from "@/server/services/categories";
import { UserError } from "@/server/services/errors";
import { addContribution, createGoal, deleteGoal, listGoals, totalSetAside } from "@/server/services/goals";
import { monthlyTotals, spendingByCategory } from "@/server/services/reports";
import { createTransaction } from "@/server/services/transactions";
import { listWallets } from "@/server/services/wallets";
import { createTestDb, createTestUser } from "./helpers";

type T = Awaited<ReturnType<typeof createTestDb>>;

async function setup(t: T) {
  const u = await createTestUser(t.db);
  await seedNewUser(t.db, u.id);
  const [cash] = await listWallets(t.db, u.id);
  const cats = Object.fromEntries((await listCategories(t.db, u.id)).map((c) => [c.name, c.id]));
  const spend = (amount: number, occurredOn: string, categoryId: string | null = cats["Dining Out"]) =>
    createTransaction(t.db, u.id, {
      type: "expense",
      amount,
      occurredOn,
      description: "",
      notes: null,
      walletId: cash.id,
      toWalletId: null,
      categoryId,
    } satisfies TransactionInput);
  return { userId: u.id, cash, cats, spend };
}

const contribution = (amount: number, direction: "add" | "withdraw" = "add") => ({
  amount,
  direction,
  occurredOn: "2026-10-20",
  note: null,
});

describe("budgets", () => {
  let t: T;
  beforeAll(async () => {
    t = await createTestDb();
  });
  afterAll(() => t.close());

  it("tracks spending against category and overall limits", async () => {
    const s = await setup(t);
    await createBudget(t.db, s.userId, { categoryId: null, amount: 10_000_00, rollover: false }, "2026-10");
    await createBudget(t.db, s.userId, { categoryId: s.cats["Dining Out"], amount: 3_000_00, rollover: false }, "2026-10");
    await s.spend(2_500_00, "2026-10-05");
    await s.spend(400_00, "2026-10-06", null); // uncategorized
    await s.spend(999_00, "2026-09-30"); // last month

    const o = await getBudgetOverview(t.db, s.userId, "2026-10");
    expect(o.overall).toMatchObject({ spentMinor: 2_900_00, remainingMinor: 7_100_00, level: "ok" });
    expect(o.categories).toHaveLength(1);
    expect(o.categories[0]).toMatchObject({ categoryName: "Dining Out", spentMinor: 2_500_00, level: "warning" });
    expect(o.totalSpentMinor).toBe(2_900_00);
    expect(o.unbudgetedMinor).toBe(400_00);
  });

  it("rolls leftovers and overspending into later months", async () => {
    const s = await setup(t);
    await createBudget(t.db, s.userId, { categoryId: s.cats["Dining Out"], amount: 3_000_00, rollover: true }, "2026-08");
    await s.spend(2_500_00, "2026-08-10"); // +500
    await s.spend(3_800_00, "2026-09-10"); // -800
    await s.spend(1_000_00, "2026-10-10");

    const [oct] = (await getBudgetOverview(t.db, s.userId, "2026-10")).categories;
    expect(oct).toMatchObject({ carryInMinor: -300_00, availableMinor: 2_700_00, remainingMinor: 1_700_00 });
    // The first rollover month starts clean.
    expect((await getBudgetOverview(t.db, s.userId, "2026-08")).categories[0].carryInMinor).toBe(0);
  });

  it("restarts rollover from this month when the amount changes", async () => {
    const s = await setup(t);
    const b = await createBudget(t.db, s.userId, { categoryId: s.cats.Groceries, amount: 3_000_00, rollover: true }, "2026-08");
    await s.spend(1_000_00, "2026-08-10", s.cats.Groceries);
    await updateBudget(t.db, s.userId, b.id, { amount: 4_000_00, rollover: true }, "2026-10");
    const [oct] = (await getBudgetOverview(t.db, s.userId, "2026-10")).categories;
    expect(oct.carryInMinor).toBe(0);
    // Same amount, rollover still on: carry keeps counting from October.
    await updateBudget(t.db, s.userId, b.id, { amount: 4_000_00, rollover: true }, "2026-11");
    await s.spend(1_000_00, "2026-10-10", s.cats.Groceries);
    expect((await getBudgetOverview(t.db, s.userId, "2026-11")).categories[0].carryInMinor).toBe(3_000_00);
  });

  it("allows one budget per category and one overall limit", async () => {
    const s = await setup(t);
    await createBudget(t.db, s.userId, { categoryId: null, amount: 100, rollover: false }, "2026-10");
    await expect(createBudget(t.db, s.userId, { categoryId: null, amount: 200, rollover: false }, "2026-10")).rejects.toThrow(/already a budget/);
    await createBudget(t.db, s.userId, { categoryId: s.cats.Fuel, amount: 100, rollover: false }, "2026-10");
    await expect(createBudget(t.db, s.userId, { categoryId: s.cats.Fuel, amount: 100, rollover: false }, "2026-10")).rejects.toThrow(/already a budget/);
    expect((await unbudgetedCategories(t.db, s.userId)).map((c) => c.name)).not.toContain("Fuel");
  });

  it("only budgets the user's own spending categories", async () => {
    const a = await setup(t);
    const b = await setup(t);
    await expect(createBudget(t.db, b.userId, { categoryId: a.cats.Fuel, amount: 100, rollover: false }, "2026-10")).rejects.toThrow(UserError);
    await expect(createBudget(t.db, a.userId, { categoryId: a.cats.Salary, amount: 100, rollover: false }, "2026-10")).rejects.toThrow(/spending categories/);
    const own = await createBudget(t.db, a.userId, { categoryId: a.cats.Fuel, amount: 100, rollover: false }, "2026-10");
    await expect(deleteBudget(t.db, b.userId, own.id)).rejects.toThrow(UserError);
    expect((await getBudgetOverview(t.db, b.userId, "2026-10")).categories).toHaveLength(0);
  });

  it("averages past spending over months that had any", async () => {
    const s = await setup(t);
    await s.spend(2_000_00, "2026-08-05");
    await s.spend(3_000_00, "2026-09-05");
    await s.spend(9_999_00, "2026-10-05"); // current month: ignored
    await s.spend(5_000_00, "2026-06-05"); // older than 3 months: ignored
    const avg = await averageMonthlySpending(t.db, s.userId, "2026-10");
    expect(avg.get(s.cats["Dining Out"])).toBe(2_500_00);
    expect(avg.get(null)).toBe(2_500_00);
  });
});

describe("goals", () => {
  let t: T;
  beforeAll(async () => {
    t = await createTestDb();
  });
  afterAll(() => t.close());

  const newGoal = { name: "MacBook", target: 1_20_000_00, targetDate: "2027-05-31", icon: "laptop", color: "#4a7fc1" } as const;

  it("adds and withdraws money, never below zero", async () => {
    const s = await setup(t);
    const g = await createGoal(t.db, s.userId, newGoal);
    await addContribution(t.db, s.userId, g.id, contribution(40_000_00));
    await addContribution(t.db, s.userId, g.id, contribution(5_000_00, "withdraw"));
    await expect(addContribution(t.db, s.userId, g.id, contribution(35_000_01, "withdraw"))).rejects.toThrow(/more than is saved/);

    const [row] = await listGoals(t.db, s.userId);
    expect(row.savedMinor).toBe(35_000_00);
    expect(await totalSetAside(t.db, s.userId)).toBe(35_000_00);
  });

  it("keeps goals private and releases money when a goal is deleted", async () => {
    const a = await setup(t);
    const b = await setup(t);
    const g = await createGoal(t.db, a.userId, newGoal);
    await expect(addContribution(t.db, b.userId, g.id, contribution(100))).rejects.toThrow(UserError);
    await expect(deleteGoal(t.db, b.userId, g.id)).rejects.toThrow(UserError);
    await addContribution(t.db, a.userId, g.id, contribution(100));
    await deleteGoal(t.db, a.userId, g.id);
    expect(await totalSetAside(t.db, a.userId)).toBe(0);
  });
});

describe("reports and alerts", () => {
  let t: T;
  beforeAll(async () => {
    t = await createTestDb();
  });
  afterAll(() => t.close());

  it("summarizes spending by category and by month, without transfers", async () => {
    const s = await setup(t);
    const bank = (await listWallets(t.db, s.userId))[0];
    await s.spend(300_00, "2026-10-01", s.cats.Groceries);
    await s.spend(200_00, "2026-10-31", s.cats["Dining Out"]);
    await s.spend(100_00, "2026-11-01", s.cats["Dining Out"]);
    await createTransaction(t.db, s.userId, {
      type: "income", amount: 1_000_00, occurredOn: "2026-09-15", description: "", notes: null,
      walletId: bank.id, toWalletId: null, categoryId: s.cats.Salary,
    });

    const byCat = await spendingByCategory(t.db, s.userId, "2026-10-01", "2026-11-01");
    expect(byCat.map((r) => [r.name, r.spentMinor])).toEqual([["Groceries", 300_00], ["Dining Out", 200_00]]);

    expect(await monthlyTotals(t.db, s.userId, "2026-08", "2026-11")).toEqual([
      { month: "2026-08", incomeMinor: 0, expenseMinor: 0 },
      { month: "2026-09", incomeMinor: 1_000_00, expenseMinor: 0 },
      { month: "2026-10", incomeMinor: 0, expenseMinor: 500_00 },
      { month: "2026-11", incomeMinor: 0, expenseMinor: 100_00 },
    ]);
  });

  it("raises budget and goal alerts that stay dismissed until something changes", async () => {
    const s = await setup(t);
    const b = await createBudget(t.db, s.userId, { categoryId: s.cats["Dining Out"], amount: 1_000_00, rollover: false }, "2026-10");
    await s.spend(850_00, "2026-10-05");
    const g = await createGoal(t.db, s.userId, { name: "Trip", target: 10_000_00, targetDate: null, icon: "plane", color: "#2f8f9d" });
    await addContribution(t.db, s.userId, g.id, contribution(5_000_00));

    const alertsFor = async () =>
      withoutDismissed(
        t.db,
        s.userId,
        buildAlerts({
          overview: await getBudgetOverview(t.db, s.userId, "2026-10"),
          goals: await listGoals(t.db, s.userId),
          month: "2026-10",
          today: "2026-10-24",
          currency: "INR",
        }),
      );

    let alerts = await alertsFor();
    expect(alerts.map((a) => a.key)).toEqual([`budget:${b.id}:2026-10:warning`, `goal:${g.id}:50`]);
    expect(alerts[0].title).toBe("85% of your Dining Out budget used");

    await dismissAlert(t.db, s.userId, alerts[0].key);
    await dismissAlert(t.db, s.userId, alerts[0].key); // idempotent
    expect((await alertsFor()).map((a) => a.key)).toEqual([`goal:${g.id}:50`]);

    // Going over the limit is new information, so it shows again.
    await s.spend(300_00, "2026-10-06");
    alerts = await alertsFor();
    expect(alerts[0]).toMatchObject({ key: `budget:${b.id}:2026-10:over`, tone: "over" });
  });
});
