import { describe, expect, it } from "vitest";
import { formatDateRange, isISODate } from "@/lib/date-format";
import { entrySearchHref, parseEntrySearch, SEARCH_MAX, SEARCH_PAGE } from "@/lib/entry-search";

const today = "2026-10-25";
const inr = (raw: Parameters<typeof parseEntrySearch>[0]) => parseEntrySearch(raw, { currency: "INR", today });

describe("reading the Entries page's address (parseEntrySearch)", () => {
  it("shows this month by default, or the month asked for", () => {
    expect(inr({}).period).toEqual({ mode: "month", month: "2026-10" });
    expect(inr({ month: "2025-03" }).period).toEqual({ mode: "month", month: "2025-03" });
    expect(inr({ month: "2025-13" }).period).toEqual({ mode: "month", month: "2026-10" }); // not a month
  });

  it("searches all time, or a range of days (ends swapped if reversed, either end optional)", () => {
    expect(inr({ period: "all", month: "2025-03" }).period).toEqual({ mode: "range" });
    expect(inr({ from: "2026-01-01", to: "2026-03-31" }).period).toEqual({
      mode: "range",
      from: "2026-01-01",
      to: "2026-03-31",
    });
    expect(inr({ from: "2026-03-31", to: "2026-01-01" }).period).toMatchObject({
      from: "2026-01-01",
      to: "2026-03-31",
    });
    expect(inr({ from: "2026-01-01" }).period).toEqual({ mode: "range", from: "2026-01-01", to: undefined });
    // A date that isn't one is ignored, so this falls back to the month.
    expect(inr({ from: "2026-02-30", month: "2026-02" }).period).toEqual({ mode: "month", month: "2026-02" });
  });

  it("reads amounts in the account's currency, ignoring what isn't one, and swaps them if reversed", () => {
    expect(inr({ min: "100", max: "1,250.50" })).toMatchObject({ minMinor: 100_00, maxMinor: 1_250_50 });
    expect(inr({ min: "500", max: "100" })).toMatchObject({ minMinor: 100_00, maxMinor: 500_00 });
    expect(inr({ min: "lots", max: "-5" })).toMatchObject({ minMinor: undefined, maxMinor: undefined });
    // Yen have no decimals: "250.5" isn't an amount there.
    expect(parseEntrySearch({ min: "250.5", max: "300" }, { currency: "JPY", today })).toMatchObject({
      minMinor: undefined,
      maxMinor: 300,
    });
  });

  it("shows 200 at a time, at most 1,000", () => {
    expect(inr({}).limit).toBe(SEARCH_PAGE);
    expect(inr({ limit: "400" }).limit).toBe(400);
    expect(inr({ limit: "50" }).limit).toBe(SEARCH_PAGE);
    expect(inr({ limit: "99999" }).limit).toBe(SEARCH_MAX);
    expect(inr({ limit: "abc" }).limit).toBe(SEARCH_PAGE);
  });
});

describe("the Entries page's address (entrySearchHref)", () => {
  it("leaves out empty values, in a stable order", () => {
    expect(entrySearchHref({})).toBe("/transactions");
    expect(entrySearchHref({ q: "chai", period: "all", wallet: "", max: "200" })).toBe(
      "/transactions?period=all&q=chai&max=200",
    );
  });
});

describe("dates for search", () => {
  it("accepts only real calendar dates in range", () => {
    expect(isISODate("2026-02-28")).toBe(true);
    expect(isISODate("2024-02-29")).toBe(true); // a leap day
    for (const v of ["2026-02-29", "2026-13-01", "2026-1-01", "1999-12-31", "2101-01-01", "", undefined]) {
      expect(isISODate(v), String(v)).toBe(false);
    }
  });

  it("labels a range as a heading", () => {
    expect(formatDateRange("2026-01-01", "2026-03-31")).toBe("1 Jan – 31 Mar 2026");
    expect(formatDateRange("2025-12-01", "2026-01-31")).toBe("1 Dec 2025 – 31 Jan 2026");
    expect(formatDateRange("2026-01-01", undefined)).toBe("From 1 Jan 2026");
    expect(formatDateRange(undefined, "2026-03-31")).toBe("Until 31 Mar 2026");
    expect(formatDateRange(undefined, undefined)).toBe("All time");
  });
});
