import { describe, expect, it } from "vitest";
import { lastWorkingDay, payMonthOf, payMonthRange, payMonthStart } from "@/lib/pay-months";

describe("lastWorkingDay", () => {
  it("steps back from a weekend to Friday", () => {
    expect(lastWorkingDay("2026-11")).toBe("2026-11-30"); // a Monday
    expect(lastWorkingDay("2026-10")).toBe("2026-10-30"); // the 31st is a Saturday
    expect(lastWorkingDay("2027-01")).toBe("2027-01-29"); // the 31st is a Sunday
    expect(lastWorkingDay("2027-02")).toBe("2027-02-26"); // the 28th is a Sunday
  });
});

describe("pay months", () => {
  const salary = ["2026-09-30", "2026-10-30", "2026-12-31", "2027-01-28"];

  it("start the day the main income arrives in the last week of the month before", () => {
    expect(payMonthStart("2026-11", salary)).toBe("2026-10-30");
    expect(payMonthStart("2027-01", salary)).toBe("2026-12-31"); // across the year
    expect(payMonthStart("2027-02", salary)).toBe("2027-01-28"); // paid a day early
    expect(payMonthStart("2026-11", ["2026-10-24", "2026-10-26", "2026-10-30"])).toBe("2026-10-26"); // the first one
  });

  it("start on the last working day when nothing came in that week", () => {
    expect(payMonthStart("2026-12", salary)).toBe("2026-11-30"); // not recorded yet
    expect(payMonthStart("2027-03", salary)).toBe("2027-02-26");
    // Earlier in the month, or after it began: income, but not what starts a pay month.
    expect(payMonthStart("2026-11", ["2026-10-15", "2026-11-01"])).toBe("2026-10-30");
  });

  it("run up to the day the next one starts", () => {
    expect(payMonthRange("2026-10", salary)).toEqual({ start: "2026-09-30", end: "2026-10-30" });
    expect(payMonthRange("2026-11", salary)).toEqual({ start: "2026-10-30", end: "2026-11-30" });
  });

  it("move on to next month's on the day its pay comes in", () => {
    expect(payMonthOf("2026-11-09", salary)).toBe("2026-11");
    expect(payMonthOf("2026-10-29", salary)).toBe("2026-10");
    expect(payMonthOf("2026-10-30", salary)).toBe("2026-11");
    expect(payMonthOf("2026-10-31", salary)).toBe("2026-11");
    expect(payMonthOf("2026-11-01", salary)).toBe("2026-11");
    expect(payMonthOf("2026-11-29", salary)).toBe("2026-11");
    expect(payMonthOf("2026-11-30", salary)).toBe("2026-12"); // the last working day
  });
});
