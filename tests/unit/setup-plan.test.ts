import { describe, expect, it } from "vitest";
import { buildPlan } from "@/lib/setup-plan";

describe("buildPlan", () => {
  it("keeps 20% to save and splits the rest across watched categories", () => {
    const plan = buildPlan({
      monthlyIncomeMinor: 42_000_00,
      monthlyBillsMinor: 16_000_00,
      watchCategories: ["Groceries", "Dining Out"],
      currency: "INR",
    });
    expect(plan.limitMinor).toBe(33_500_00); // 80% = 33,600, rounded down to a friendly number
    expect(plan.saveMinor).toBe(8_500_00); // so savings stay at least 20%
    expect(plan.limitMinor! + plan.saveMinor).toBe(42_000_00);
    expect(plan.flexibleMinor).toBe(17_500_00);
    expect(plan.categories).toEqual([
      { name: "Groceries", amountMinor: 6_200_00 }, // 35% of 17,500 = 6,125
      { name: "Dining Out", amountMinor: 2_700_00 }, // 15% = 2,625, rounded up to the next 100
    ]);
  });

  it("never lets category budgets swallow all the flexible money", () => {
    const plan = buildPlan({
      monthlyIncomeMinor: 30_000_00,
      monthlyBillsMinor: 0,
      watchCategories: ["Groceries", "Dining Out", "Shopping", "Transport", "Fuel", "Entertainment", "Travel"],
      currency: "INR",
    });
    const allocated = plan.categories.reduce((s, c) => s + c.amountMinor, 0);
    expect(allocated).toBeLessThanOrEqual(plan.flexibleMinor * 0.85); // 80% plus rounding up
  });

  it("adapts when bills are bigger than the usual limit", () => {
    const plan = buildPlan({
      monthlyIncomeMinor: 20_000_00,
      monthlyBillsMinor: 18_000_00,
      watchCategories: [],
      currency: "INR",
    });
    expect(plan.limitMinor).toBe(19_500_00); // bills + ~10% cushion, within income
    expect(plan.saveMinor).toBe(500_00);
    expect(plan.notes[0]).toMatch(/fixed bills take most/);
  });

  it("asks for income before suggesting a limit", () => {
    const plan = buildPlan({
      monthlyIncomeMinor: 0,
      monthlyBillsMinor: 5_000_00,
      watchCategories: ["Groceries"],
      currency: "INR",
    });
    expect(plan.limitMinor).toBeNull();
    expect(plan.categories).toEqual([]);
  });
});
