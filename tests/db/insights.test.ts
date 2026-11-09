import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedNewUser } from "@/server/db/seed-defaults";
import { transaction } from "@/server/db/schema";
import { createBudget } from "@/server/services/budgets";
import { listCategories } from "@/server/services/categories";
import { addContribution, createGoal } from "@/server/services/goals";
import { buildInsightFacts, factsHash, insightMonths } from "@/server/services/insight-facts";
import { getInsight, refreshesUsed, saveInsight, takeRefresh, giveBackRefresh } from "@/server/services/insights";
import { createRule } from "@/server/services/recurring";
import { createTransaction } from "@/server/services/transactions";
import { listWallets } from "@/server/services/wallets";
import { createTestDb, createTestUser } from "./helpers";

const today = "2026-10-24";

describe("insight facts", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let userId: string;
  let cashId: string;
  let c: Record<string, string>;
  const add = (type: "income" | "expense", amount: number, occurredOn: string, description: string, cat: string) =>
    createTransaction(t.db, userId, {
      type,
      amount,
      occurredOn,
      description,
      notes: null,
      walletId: cashId,
      toWalletId: null,
      categoryId: c[cat],
    });
  const facts = (kind: "month" | "so_far") =>
    buildInsightFacts(t.db, userId, { kind, month: kind === "month" ? "2026-09" : "2026-10", today, currency: "INR" });

  beforeAll(async () => {
    t = await createTestDb();
    userId = (await createTestUser(t.db)).id;
    await seedNewUser(t.db, userId);
    cashId = (await listWallets(t.db, userId))[0].id;
    c = Object.fromEntries((await listCategories(t.db, userId)).map((x) => [x.name, x.id]));

    await createBudget(t.db, userId, { categoryId: null, amount: 20_000_00, rollover: false }, "2026-08");
    await add("expense", 4_000_00, "2026-08-08", "Big Bazaar", "Groceries");
    await add("expense", 1_000_00, "2026-08-12", "Cafe", "Dining Out");

    await add("income", 40_000_00, "2026-09-01", "Salary", "Salary");
    await add("expense", 15_000_00, "2026-09-05", "Rent", "Rent & Housing");
    await add("expense", 5_000_00, "2026-09-08", "Big Bazaar", "Groceries");
    await add("expense", 450_00, "2026-09-10", "Swiggy", "Dining Out");
    await add("expense", 450_00, "2026-09-11", "Swiggy", "Dining Out"); // looks like a double charge
    await add("expense", 2_000_00, "2026-09-28", "Birthday dinner", "Dining Out");

    // Netflix went from 649 to 799.
    const netflix = await createRule(
      t.db,
      userId,
      {
        type: "expense",
        amount: 799_00,
        description: "Netflix",
        walletId: cashId,
        toWalletId: null,
        categoryId: c.Subscriptions,
        frequency: "monthly",
        interval: 1,
        anchorDate: "2026-11-14",
        endDate: null,
        mode: "auto",
        isSubscription: true,
      },
      today,
    );
    for (const [amountMinor, occurredOn] of [
      [649_00, "2026-08-14"],
      [799_00, "2026-09-14"],
    ] as const) {
      await t.db.insert(transaction).values({
        userId,
        type: "expense",
        amountMinor,
        occurredOn,
        description: "Netflix",
        merchantKey: "netflix",
        walletId: cashId,
        categoryId: c.Subscriptions,
        recurringRuleId: netflix.id,
        source: "recurring",
      });
    }

    const phone = await createGoal(t.db, userId, {
      name: "Phone",
      target: 20_000_00,
      targetDate: "2027-03-15",
      icon: "smartphone",
      color: "#4a7fc1",
    });
    await addContribution(t.db, userId, phone.id, {
      direction: "add",
      amount: 2_000_00,
      occurredOn: "2026-09-20",
      note: null,
    });

    await add("expense", 3_000_00, "2026-10-05", "Big Bazaar", "Groceries");
    await add("expense", 500_00, "2026-10-20", "Cafe", "Dining Out");
    await add("expense", 900_00, "2026-10-30", "Future-dated", "Shopping"); // after today: not counted so far
  });
  afterAll(() => t.close());

  it("sums up a finished month against the one before", async () => {
    const f = await facts("month");
    expect(f).toMatchObject({
      period: "September 2026",
      entries: 7,
      income: "₹40,000",
      spending: "₹23,699",
      kept: { amount: "₹16,301", shareOfIncome: "41%" },
      comparedWith: { period: "August 2026", spending: "₹5,649", change: "320% more" },
      overallLimit: {
        limit: "₹20,000",
        spent: "₹23,699",
        used: "118%",
        left: null,
        over: "₹3,699",
        projectedMonthEnd: null,
        projectedOverLimit: false,
      },
      possibleDuplicates: [{ what: "Swiggy", amount: "₹450", dates: ["10 Sep", "11 Sep"] }],
      trackedSubscriptions: { count: 1, spent: "₹799" },
      priceChanges: [{ name: "Netflix", from: "₹649", to: "₹799" }],
      entriesWithoutCategory: 0,
    });
    expect(f.categories[0]).toEqual({
      name: "Rent & Housing",
      spent: "₹15,000",
      shareOfSpending: "63%",
      before: "₹0",
      change: "nothing before to compare",
    });
    expect(f.categories.find((x) => x.name === "Groceries")).toMatchObject({ before: "₹4,000", change: "25% more" });
    expect(f.biggestExpenses.map((b) => b.what)).toEqual(["Rent", "Big Bazaar", "Birthday dinner"]);
    expect(f.goals).toEqual([
      {
        name: "Phone",
        saved: "₹2,000",
        target: "₹20,000",
        addedInPeriod: "₹2,000",
        status: "needs ₹2,571.43 a month to reach by March 2027",
      },
    ]);
  });

  it("keeps a finished month's facts stable when this month changes", async () => {
    const before = factsHash(await facts("month"));
    const [phone] = (await t.db.query.goal.findMany()).filter((g) => g.name === "Phone");
    await addContribution(t.db, userId, phone.id, {
      direction: "add",
      amount: 1_000_00,
      occurredOn: "2026-10-10",
      note: null,
    });
    await createGoal(t.db, userId, {
      name: "Trip",
      target: 10_000_00,
      targetDate: null,
      icon: "plane",
      color: "#2f8f9d",
    });
    expect(factsHash(await facts("month"))).toBe(before);
    // Editing September itself does change them.
    await add("expense", 100_00, "2026-09-29", "Tea", "Dining Out");
    expect(factsHash(await facts("month"))).not.toBe(before);
  });

  it("checks in on this month against the same days last month", async () => {
    const f = await facts("so_far");
    expect(f).toMatchObject({
      period: "1–24 October 2026",
      dayOfMonth: { day: 24, daysInMonth: 31 },
      entries: 2,
      spending: "₹3,500",
      noIncomeRecorded: true,
      kept: null,
      // 1–24 Sep leaves out the birthday dinner and tea later in the month.
      comparedWith: { period: "1–24 September 2026", spending: "₹21,699", change: "84% less" },
    });
    expect(f.overallLimit?.projectedMonthEnd).toMatch(/^about ₹\d/);
  });

  it("stores one report per period and counts rewrites per month", async () => {
    const report = {
      headline: "A steady month.",
      items: [{ kind: "good" as const, title: "Kept 41%", detail: "You kept ₹16,301." }],
    };
    await saveInsight(t.db, userId, { kind: "month", month: "2026-09", factsHash: "a", report, model: "groq" });
    await saveInsight(t.db, userId, { kind: "month", month: "2026-09", factsHash: "b", report, model: "groq" });
    expect(await getInsight(t.db, userId, "month", "2026-09")).toMatchObject({ factsHash: "b", report });
    expect(await getInsight(t.db, userId, "so_far", "2026-09")).toBeNull();

    expect(await takeRefresh(t.db, userId, "2026-10", 2)).toBe(true);
    expect(await takeRefresh(t.db, userId, "2026-10", 2)).toBe(true);
    expect(await takeRefresh(t.db, userId, "2026-10", 2)).toBe(false);
    expect(await refreshesUsed(t.db, userId, "2026-10")).toBe(2);
    await giveBackRefresh(t.db, userId, "2026-10");
    expect(await refreshesUsed(t.db, userId, "2026-10")).toBe(1);
    expect(await refreshesUsed(t.db, userId, "2026-11")).toBe(0);
  });
});

describe("insight facts with pay on the last working day", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let userId: string;

  beforeAll(async () => {
    t = await createTestDb();
    userId = (await createTestUser(t.db)).id;
    await seedNewUser(t.db, userId);
    const cashId = (await listWallets(t.db, userId))[0].id;
    const c = Object.fromEntries((await listCategories(t.db, userId)).map((x) => [x.name, x.id]));
    const add = (type: "income" | "expense", amount: number, occurredOn: string, description: string, cat: string) =>
      createTransaction(t.db, userId, {
        type,
        amount,
        occurredOn,
        description,
        notes: null,
        walletId: cashId,
        toWalletId: null,
        categoryId: c[cat],
      });
    // 31 Oct 2026 is a Saturday, so October's salary came on Friday the 30th.
    for (const [month, payday] of [
      ["2026-09", "2026-09-30"],
      ["2026-10", "2026-10-30"],
    ]) {
      await add("expense", 15_000_00, `${month}-05`, "Rent", "Rent & Housing");
      await add("expense", 6_000_00, `${month}-10`, "Big Bazaar", "Groceries");
      await add("expense", 2_000_00, `${month}-18`, "Swiggy", "Dining Out");
      await add("expense", 3_000_00, `${month}-25`, "Shopping", "Shopping");
      await add("income", 60_000_00, payday, "Salary", "Salary");
    }
    await add("expense", 15_000_00, "2026-11-05", "Rent", "Rent & Housing");
    await add("expense", 6_000_00, "2026-11-07", "Big Bazaar", "Groceries");
  });
  afterAll(() => t.close());

  const facts = (kind: "month" | "so_far", month: string, today: string) =>
    buildInsightFacts(t.db, userId, { kind, month, today, currency: "INR" });

  it("says when last month's pay came, before this month's arrives", async () => {
    expect(await facts("so_far", "2026-11", "2026-11-09")).toMatchObject({
      income: "₹0",
      noIncomeRecorded: true,
      incomeLastMonthOn: "30 Oct",
    });
    // The day before payday still has nothing in.
    expect((await facts("so_far", "2026-10", "2026-10-29")).incomeLastMonthOn).toBe("30 Sep");
  });

  it("says nothing more once pay is in, or for a finished month", async () => {
    const payday = await facts("so_far", "2026-10", "2026-10-30");
    expect(payday).toMatchObject({ income: "₹60,000", kept: { amount: "₹34,000", shareOfIncome: "57%" } });
    expect(payday.incomeLastMonthOn).toBeUndefined();
    // Left out of the JSON, so reports already written for finished months still match their facts.
    expect(JSON.stringify(await facts("month", "2026-10", "2026-11-09"))).not.toContain("incomeLastMonthOn");
  });
});

describe("insight facts in pay months (a main income is set)", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let userId: string;
  let salary: string;

  beforeAll(async () => {
    t = await createTestDb();
    userId = (await createTestUser(t.db)).id;
    await seedNewUser(t.db, userId);
    const cashId = (await listWallets(t.db, userId))[0].id;
    const c = Object.fromEntries((await listCategories(t.db, userId)).map((x) => [x.name, x.id]));
    salary = c.Salary;
    const add = (type: "income" | "expense", amount: number, occurredOn: string, description: string, cat: string) =>
      createTransaction(t.db, userId, {
        type,
        amount,
        occurredOn,
        description,
        notes: null,
        walletId: cashId,
        toWalletId: null,
        categoryId: c[cat],
      });
    await createBudget(t.db, userId, { categoryId: null, amount: 20_000_00, rollover: false }, "2026-08");
    await add("expense", 15_000_00, "2026-08-05", "Rent", "Rent & Housing");
    // Salary on the last working day: 31 Aug, 30 Sep, and 30 Oct (31 Oct is a Saturday).
    await add("income", 60_000_00, "2026-08-31", "Salary", "Salary");
    for (const month of ["2026-09", "2026-10"]) {
      await add("expense", 15_000_00, `${month}-05`, "Rent", "Rent & Housing");
      await add("expense", 6_000_00, `${month}-10`, "Big Bazaar", "Groceries");
      await add("expense", 2_000_00, `${month}-18`, "Swiggy", "Dining Out");
      await add("expense", 3_000_00, `${month}-25`, "Shopping", "Shopping");
    }
    await add("income", 60_000_00, "2026-09-30", "Salary", "Salary");
    await add("income", 5_000_00, "2026-10-15", "Logo design", "Freelance");
    await add("income", 500_00, "2026-10-27", "Refund", "Refunds & Cashback"); // not the main income
    await add("income", 60_000_00, "2026-10-30", "Salary", "Salary");
    await add("expense", 1_000_00, "2026-10-31", "Dinner", "Dining Out"); // paid for by October's salary
    await add("expense", 15_000_00, "2026-11-05", "Rent", "Rent & Housing");
    await add("expense", 6_000_00, "2026-11-07", "Big Bazaar", "Groceries");
  });
  afterAll(() => t.close());

  const facts = (kind: "month" | "so_far", month: string, today: string) =>
    buildInsightFacts(t.db, userId, { kind, month, today, currency: "INR", mainIncome: salary });
  const months = (today: string, mainIncome: string | null = salary) =>
    insightMonths(t.db, userId, { today, mainIncome });

  it("move on to the next month on the day the main income comes in", async () => {
    expect(await months("2026-10-29")).toEqual({ thisMonth: "2026-10", lastMonth: "2026-09" });
    expect(await months("2026-10-30")).toEqual({ thisMonth: "2026-11", lastMonth: "2026-10" });
    expect(await months("2026-11-09")).toEqual({ thisMonth: "2026-11", lastMonth: "2026-10" });
    // Not recorded yet: November's last working day.
    expect(await months("2026-11-30")).toEqual({ thisMonth: "2026-12", lastMonth: "2026-11" });
    expect(await months("2026-10-30", null)).toEqual({ thisMonth: "2026-10", lastMonth: "2026-09" });
  });

  it("check in from payday, with that pay set against what it pays for", async () => {
    const f = await facts("so_far", "2026-11", "2026-11-09");
    expect(f).toMatchObject({
      period: "30 Oct – 9 Nov 2026",
      dayOfMonth: { day: 11, daysInMonth: 31 },
      income: "₹60,000",
      spending: "₹22,000",
      kept: { amount: "₹38,000", shareOfIncome: "63%" },
      noIncomeRecorded: false,
      comparedWith: { period: "30 Sep – 10 Oct 2026", spending: "₹21,000", change: "5% more" },
      // The limit is for calendar November: no 31 Oct dinner, and its pace over 1–9 November.
      overallLimit: { spent: "₹21,000", over: "₹1,000", projectedMonthEnd: "about ₹70,000" },
    });
    expect(f.incomeLastMonthOn).toBeUndefined();
  });

  it("report a finished pay month with every income in it", async () => {
    expect(await facts("month", "2026-10", "2026-11-09")).toMatchObject({
      period: "30 Sep – 29 Oct 2026",
      income: "₹65,500", // salary 30 Sep, freelance and the refund
      spending: "₹26,000",
      kept: { amount: "₹39,500", shareOfIncome: "60%" },
      comparedWith: { period: "31 Aug – 29 Sep 2026", spending: "₹26,000", change: "about the same" },
      averageMonthlySpendingBefore: "₹20,500", // August's and September's pay months
      overallLimit: { spent: "₹27,000" }, // calendar October
    });
  });
});
