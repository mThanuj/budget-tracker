import { describe, expect, it } from "vitest";
import { addDays, addMonths, isValidTimeZone, monthOf, monthRange, sameDaysLastMonth, todayInTz } from "@/lib/dates";

describe("todayInTz", () => {
  // 2026-10-23 20:00 UTC is already Oct 24 in India, still Oct 23 in New York.
  const now = new Date("2026-10-23T20:00:00Z");

  it("returns the calendar date in the user's timezone, not the server's", () => {
    expect(todayInTz("Asia/Kolkata", now)).toBe("2026-10-24");
    expect(todayInTz("America/New_York", now)).toBe("2026-10-23");
    expect(todayInTz("UTC", now)).toBe("2026-10-23");
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA zones and rejects junk", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
  });
});

describe("date arithmetic", () => {
  it("adds days across month and leap-year boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("adds months across year boundaries", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });

  it("builds half-open month ranges", () => {
    expect(monthOf("2026-10-23")).toBe("2026-10");
    expect(monthRange("2026-12")).toEqual({ start: "2026-12-01", end: "2027-01-01" });
  });
});

describe("relativeDay", () => {
  it("reads naturally mid-sentence", async () => {
    const { relativeDay } = await import("@/lib/date-format");
    expect(relativeDay("2026-10-24", "2026-10-24")).toBe("today");
    expect(relativeDay("2026-10-25", "2026-10-24")).toBe("tomorrow");
    expect(relativeDay("2026-10-23", "2026-10-24")).toBe("yesterday");
    expect(relativeDay("2026-10-26", "2026-10-24")).toBe("Mon, 26 Oct");
    expect(relativeDay("2027-01-05", "2026-10-24")).toBe("Tue, 5 Jan 2027");
  });
});

describe("sameDaysLastMonth", () => {
  it("covers the same days of last month, end exclusive", () => {
    expect(sameDaysLastMonth("2026-10-24")).toEqual({ start: "2026-09-01", end: "2026-09-25" });
    expect(sameDaysLastMonth("2026-10-01")).toEqual({ start: "2026-09-01", end: "2026-09-02" });
  });

  it("stops at the end of a shorter month", () => {
    expect(sameDaysLastMonth("2026-03-31")).toEqual({ start: "2026-02-01", end: "2026-03-01" });
    expect(sameDaysLastMonth("2028-03-30")).toEqual({ start: "2028-02-01", end: "2028-03-01" }); // leap year
  });

  it("crosses the year boundary", () => {
    expect(sameDaysLastMonth("2027-01-15")).toEqual({ start: "2026-12-01", end: "2026-12-16" });
  });
});
