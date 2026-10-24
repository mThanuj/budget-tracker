import { describe, expect, it } from "vitest";
import { budgetProgress, carryIn, daysLeftInMonth, monthsBetween, suggestLimit } from "@/lib/budgets";
import { goalProgress, highestMilestone } from "@/lib/goals";

describe("monthsBetween", () => {
  it("counts whole months across years", () => {
    expect(monthsBetween("2026-10", "2026-10")).toBe(0);
    expect(monthsBetween("2026-10", "2027-02")).toBe(4);
    expect(monthsBetween("2026-10", "2026-08")).toBe(-2);
  });
});

describe("budgetProgress", () => {
  it("warns from 80% and flags overspending only past the limit", () => {
    expect(budgetProgress({ limitMinor: 1000, spentMinor: 799 }).level).toBe("ok");
    expect(budgetProgress({ limitMinor: 1000, spentMinor: 800 }).level).toBe("warning");
    expect(budgetProgress({ limitMinor: 1000, spentMinor: 1000 }).level).toBe("warning");
    expect(budgetProgress({ limitMinor: 1000, spentMinor: 1001 })).toMatchObject({ level: "over", remainingMinor: -1 });
  });

  it("adds carried-over money to what's available", () => {
    expect(budgetProgress({ limitMinor: 3000, carryInMinor: 500, spentMinor: 1000 })).toMatchObject({
      availableMinor: 3500,
      remainingMinor: 2500,
    });
    // Past overspending can eat the whole limit.
    expect(budgetProgress({ limitMinor: 3000, carryInMinor: -3000, spentMinor: 10 }).level).toBe("over");
  });
});

describe("carryIn", () => {
  it("is zero in the month rollover starts", () => {
    expect(carryIn({ limitMinor: 3000, rolloverFrom: "2026-10", month: "2026-10", spentSinceMinor: 0 })).toBe(0);
  });

  it("accumulates leftovers and overspending from earlier months", () => {
    // Oct: spent 2500 of 3000 (+500). Nov: spent 3800 (-800). Into Dec: -300.
    expect(carryIn({ limitMinor: 3000, rolloverFrom: "2026-10", month: "2026-12", spentSinceMinor: 6300 })).toBe(-300);
  });
});

describe("daysLeftInMonth", () => {
  it("counts today and handles month lengths", () => {
    expect(daysLeftInMonth("2026-10", "2026-10-24")).toBe(8);
    expect(daysLeftInMonth("2028-02", "2028-02-29")).toBe(1);
    expect(daysLeftInMonth("2026-11", "2026-10-24")).toBeNull();
  });
});

describe("suggestLimit", () => {
  it("rounds averages up to friendly numbers", () => {
    expect(suggestLimit(2_637_00, "INR")).toBe(2_700_00);
    expect(suggestLimit(412_00, "INR")).toBe(450_00);
    expect(suggestLimit(14_200_00, "INR")).toBe(14_500_00);
    expect(suggestLimit(2_700_00, "INR")).toBe(2_700_00);
    expect(suggestLimit(3_210, "JPY")).toBe(3_300);
  });

  it("has nothing to suggest without history", () => {
    expect(suggestLimit(0, "INR")).toBeNull();
  });
});

describe("goalProgress", () => {
  const today = "2026-10-24";

  it("works out a monthly amount to reach a dated goal", () => {
    // ₹1,20,000 target, ₹40,000 saved, due May 2027: Oct..May is 8 months.
    expect(
      goalProgress({ targetMinor: 120_000_00, savedMinor: 40_000_00, targetDate: "2027-05-31", today }),
    ).toMatchObject({ remainingMinor: 80_000_00, monthsLeft: 8, perMonthMinor: 10_000_00, reached: false });
  });

  it("handles reached, undated and overdue goals", () => {
    expect(goalProgress({ targetMinor: 100, savedMinor: 150, targetDate: "2027-01-01", today })).toMatchObject({
      reached: true,
      ratio: 1,
      remainingMinor: 0,
      perMonthMinor: null,
    });
    expect(goalProgress({ targetMinor: 100, savedMinor: 10, targetDate: null, today }).perMonthMinor).toBeNull();
    expect(goalProgress({ targetMinor: 100, savedMinor: 10, targetDate: "2026-09-30", today }).overdue).toBe(true);
  });
});

describe("highestMilestone", () => {
  it("returns the last milestone passed", () => {
    expect(highestMilestone(0.2)).toBeNull();
    expect(highestMilestone(0.5)).toBe(50);
    expect(highestMilestone(0.99)).toBe(75);
    expect(highestMilestone(1)).toBe(100);
  });
});

describe("niceTicks", () => {
  it("covers the maximum with round steps", async () => {
    const { niceTicks } = await import("@/lib/chart-scale");
    expect(niceTicks(4_200_000)).toEqual([0, 1_000_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000]);
    expect(niceTicks(95)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(0)).toEqual([0]);
  });
});
