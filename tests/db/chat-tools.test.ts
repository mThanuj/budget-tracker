import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { moneyTools } from "@/server/ai/chat";
import { seedNewUser } from "@/server/db/seed-defaults";
import { createBudget } from "@/server/services/budgets";
import { listCategories } from "@/server/services/categories";
import { addContribution, createGoal } from "@/server/services/goals";
import { createRule } from "@/server/services/recurring";
import { createTransaction } from "@/server/services/transactions";
import { createWallet, listWallets } from "@/server/services/wallets";
import { createTestDb, createTestUser } from "./helpers";

const today = "2026-10-24";
type Tools = ReturnType<typeof moneyTools>;
// Tools are plain functions here; the options argument only matters inside the SDK.
const run = <K extends keyof Tools>(tools: Tools, name: K, input: Parameters<NonNullable<Tools[K]["execute"]>>[0]) =>
  (tools[name].execute as (i: typeof input, o: unknown) => Promise<unknown>)(input, { toolCallId: "t", messages: [] });

describe("money chat tools", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let alice: string;
  let bob: string;
  let aliceTools: Tools;

  beforeAll(async () => {
    t = await createTestDb();
    alice = (await createTestUser(t.db, { name: "Alice" })).id;
    bob = (await createTestUser(t.db, { name: "Bob" })).id;
    for (const id of [alice, bob]) await seedNewUser(t.db, id);

    const [aliceCash] = await listWallets(t.db, alice);
    const aliceCats = Object.fromEntries((await listCategories(t.db, alice)).map((c) => [c.name, c.id]));
    await createWallet(t.db, alice, { name: "SBI", kind: "bank", color: "#4a7fc1", openingBalanceMinor: 10_000_00 });
    await createTransaction(t.db, alice, {
      type: "expense",
      amount: 2_380_00,
      occurredOn: "2026-10-05",
      description: "Big Bazaar",
      notes: null,
      walletId: aliceCash.id,
      toWalletId: null,
      categoryId: aliceCats.Groceries,
    });
    await createBudget(t.db, alice, { categoryId: null, amount: 5_000_00, rollover: false }, "2026-10");
    const phone = await createGoal(t.db, alice, {
      name: "Phone",
      target: 20_000_00,
      targetDate: null,
      icon: "smartphone",
      color: "#4a7fc1",
    });
    await addContribution(t.db, alice, phone.id, { direction: "add", amount: 1_000_00, occurredOn: today, note: null });
    await createRule(
      t.db,
      alice,
      {
        type: "expense",
        amount: 1_500_00,
        description: "Gym",
        walletId: aliceCash.id,
        toWalletId: null,
        categoryId: null,
        frequency: "monthly",
        interval: 1,
        anchorDate: "2026-10-28",
        endDate: null,
        mode: "auto",
        isSubscription: false,
      },
      today,
    );

    // Bob has a secret that must never show up in Alice's answers.
    const [bobCash] = await listWallets(t.db, bob);
    await createWallet(t.db, bob, {
      name: "Bob's secret account",
      kind: "bank",
      color: "#4a7fc1",
      openingBalanceMinor: 9_99_999_00,
    });
    await createTransaction(t.db, bob, {
      type: "expense",
      amount: 77_777_00,
      occurredOn: "2026-10-06",
      description: "Bob secret purchase",
      notes: null,
      walletId: bobCash.id,
      toWalletId: null,
      categoryId: null,
    });
    await createGoal(t.db, bob, {
      name: "Bob secret goal",
      target: 1_00_000_00,
      targetDate: null,
      icon: "gift",
      color: "#4a7fc1",
    });

    aliceTools = moneyTools(t.db, { id: alice, currency: "INR", today });
  });
  afterAll(() => t.close());

  it("only ever returns the signed-in user's data", async () => {
    const outputs = await Promise.all([
      run(aliceTools, "getBalances", {}),
      run(aliceTools, "getSpending", { from: "2026-01-01", to: "2026-12-31", categories: null }),
      run(aliceTools, "findEntries", { from: null, to: null, search: "secret", category: null, type: null, limit: 20 }),
      run(aliceTools, "findEntries", { from: null, to: null, search: null, category: null, type: null, limit: 20 }),
      run(aliceTools, "getBudgets", { month: null }),
      run(aliceTools, "getUpcoming", { days: 60 }),
      run(aliceTools, "getGoals", {}),
      run(aliceTools, "getMonthlyTrend", { months: 12 }),
      run(aliceTools, "checkAffordability", { amount: 500 }),
    ]);
    const text = JSON.stringify(outputs);
    expect(text).not.toMatch(/Bob|secret|77,777/);
    expect(text).toContain("Big Bazaar");
  });

  it("answers with formatted amounts the model can quote", async () => {
    const balances = (await run(aliceTools, "getBalances", {})) as Record<string, unknown>;
    expect(balances).toMatchObject({ total: "₹7,620", setAsideForGoals: "₹1,000", freeToUse: "₹6,620" });
    const spending = (await run(aliceTools, "getSpending", {
      from: "2026-10-01",
      to: "2026-10-31",
      categories: null,
    })) as Record<string, unknown>;
    expect(spending).toMatchObject({
      spentInTotal: "₹2,380",
      byCategory: [{ category: "Groceries", spent: "₹2,380" }],
    });
  });

  it("totals a group of categories so the model never adds amounts itself", async () => {
    const food = (await run(aliceTools, "getSpending", {
      from: "2026-10-01",
      to: "2026-10-31",
      categories: ["groceries", "Dining Out"],
    })) as Record<string, unknown>;
    expect(food).toMatchObject({ spentOnTheseCategories: "₹2,380", byCategory: [{ category: "Groceries" }] });
    const shop = (await run(aliceTools, "getSpending", {
      from: "2026-10-01",
      to: "2026-10-31",
      categories: ["Big Bazaar"],
    })) as Record<string, unknown>;
    expect(shop).toMatchObject({ notCategories: ["Big Bazaar"] });
    expect(shop).not.toHaveProperty("spentOnTheseCategories"); // no misleading ₹0
    const search = (await run(aliceTools, "findEntries", {
      from: null,
      to: null,
      search: "bazaar",
      category: null,
      type: null,
      limit: 5,
    })) as Record<string, unknown>;
    expect(search).toMatchObject({ count: 1, spentOnThese: "₹2,380" });
    const upcoming = (await run(aliceTools, "getUpcoming", { days: 30 })) as { date: string }[];
    expect(upcoming[0].date).toBe("Wed, 28 Oct"); // friendly dates, not ISO
  });

  it("checks affordability against the limit, upcoming bills and free money", async () => {
    // Limit 5,000 − spent 2,380 − gym bill 1,500 due this month = 1,120 left.
    const small = (await run(aliceTools, "checkAffordability", { amount: 1_000 })) as Record<string, unknown>;
    expect(small).toMatchObject({
      monthlyLimitLeftAfterBills: "₹1,120",
      billsStillDueThisMonth: "₹1,500",
      verdict: "Fits within this month's limit and free money",
    });
    const big = (await run(aliceTools, "checkAffordability", { amount: 5_000 })) as Record<string, unknown>;
    expect(big.verdict).toBe("Doesn't fit this month's limit");
  });

  it("keeps date ranges sane", async () => {
    const spending = (await run(aliceTools, "getSpending", {
      from: "1990-01-01",
      to: "2099-01-01",
      categories: null,
    })) as { from: string; to: string };
    expect(spending.to).toBe("2027-10-25"); // capped about a year ahead
    expect(spending.from >= "2025-10-24").toBe(true); // at most two years back from there
  });
});
