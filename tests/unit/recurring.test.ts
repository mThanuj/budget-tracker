import { describe, expect, it } from "vitest";
import { normalizeMerchant } from "@/lib/merchant";
import {
  describeRepeat,
  monthlyEquivalent,
  occurrence,
  occurrenceOnOrAfter,
  occurrencesBetween,
  type Schedule,
} from "@/lib/recurring";
import { detectSubscriptions, type SpendRecord } from "@/lib/subscriptions";

const monthly = (anchorDate: string, interval = 1, endDate: string | null = null): Schedule => ({
  frequency: "monthly",
  interval,
  anchorDate,
  endDate,
});

describe("occurrence", () => {
  it("clamps month-end dates without drifting", () => {
    const s = monthly("2026-01-31");
    expect([0, 1, 2, 3].map((n) => occurrence(s, n))).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("handles leap days on yearly schedules", () => {
    const s: Schedule = { frequency: "yearly", interval: 1, anchorDate: "2028-02-29", endDate: null };
    expect([0, 1, 4].map((n) => occurrence(s, n))).toEqual(["2028-02-29", "2029-02-28", "2032-02-29"]);
  });

  it("steps weeks and multi-month intervals", () => {
    const s: Schedule = { frequency: "weekly", interval: 2, anchorDate: "2026-10-02", endDate: null };
    expect(occurrence(s, 3)).toBe("2026-11-13");
    expect(occurrence(monthly("2026-11-15", 3), 2)).toBe("2027-05-15");
  });
});

describe("occurrenceOnOrAfter", () => {
  it("finds the next date on or after a given day", () => {
    const s = monthly("2026-01-31");
    expect(occurrenceOnOrAfter(s, "2026-02-01")).toBe("2026-02-28");
    expect(occurrenceOnOrAfter(s, "2026-02-28")).toBe("2026-02-28");
    expect(occurrenceOnOrAfter(s, "2026-03-01")).toBe("2026-03-31");
    expect(occurrenceOnOrAfter(s, "2025-06-01")).toBe("2026-01-31"); // before the anchor
  });

  it("returns null after the end date", () => {
    expect(occurrenceOnOrAfter(monthly("2026-01-15", 1, "2026-03-20"), "2026-03-16")).toBeNull();
  });

  it("works for weekly schedules", () => {
    const s: Schedule = { frequency: "weekly", interval: 1, anchorDate: "2026-10-05", endDate: null };
    expect(occurrenceOnOrAfter(s, "2026-10-06")).toBe("2026-10-12");
    expect(occurrenceOnOrAfter(s, "2026-10-12")).toBe("2026-10-12");
  });
});

describe("occurrencesBetween", () => {
  it("lists catch-up dates and respects the cap", () => {
    expect(occurrencesBetween(monthly("2026-07-01"), "2026-08-01", "2026-10-24")).toEqual([
      "2026-08-01",
      "2026-09-01",
      "2026-10-01",
    ]);
    const daily: Schedule = { frequency: "weekly", interval: 1, anchorDate: "2000-01-01", endDate: null };
    expect(occurrencesBetween(daily, "2000-01-01", "2026-01-01")).toHaveLength(400);
  });
});

describe("monthlyEquivalent and describeRepeat", () => {
  it("normalizes costs to a month", () => {
    expect(monthlyEquivalent(1_200_00, "yearly", 1)).toBe(100_00);
    expect(monthlyEquivalent(300_00, "monthly", 3)).toBe(100_00);
    expect(monthlyEquivalent(100_00, "weekly", 1)).toBe(433_33);
  });

  it("describes schedules in words", () => {
    expect(describeRepeat("monthly", 1, "2026-10-01")).toBe("Every month on the 1st");
    expect(describeRepeat("monthly", 1, "2026-10-22")).toBe("Every month on the 22nd");
    expect(describeRepeat("monthly", 1, "2026-10-11")).toBe("Every month on the 11th");
    expect(describeRepeat("weekly", 2, "2026-10-01")).toBe("Every 2 weeks");
  });
});

describe("normalizeMerchant", () => {
  it("groups the same merchant written different ways", () => {
    expect(normalizeMerchant("Netflix 649")).toBe("netflix");
    expect(normalizeMerchant("NETFLIX.COM")).toBe("netflix");
    expect(normalizeMerchant("UPI/netflix/ref 88123")).toBe("netflix");
    expect(normalizeMerchant("Spotify India Pvt Ltd")).toBe("spotify");
    expect(normalizeMerchant("Cult.fit monthly")).toBe("cult fit");
    expect(normalizeMerchant("12345")).toBe("");
  });
});

describe("detectSubscriptions", () => {
  let id = 0;
  const rec = (description: string, amountMinor: number, occurredOn: string): SpendRecord => ({
    id: String(++id),
    description,
    amountMinor,
    occurredOn,
    categoryId: null,
    walletId: "w",
  });

  it("spots a monthly charge, even after a price change", () => {
    const found = detectSubscriptions(
      [
        rec("Netflix", 649_00, "2026-07-12"),
        rec("NETFLIX.COM", 649_00, "2026-08-12"),
        rec("Netflix", 799_00, "2026-09-12"),
      ],
      new Set(),
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      merchantKey: "netflix",
      frequency: "monthly",
      amountMinor: 799_00,
      nextExpectedOn: "2026-10-12",
      occurrences: 3,
    });
  });

  it("ignores irregular or wildly varying spending, and keys already tracked", () => {
    const groceries = [
      rec("Big Bazaar", 2_380_00, "2026-07-03"),
      rec("Big Bazaar", 900_00, "2026-08-02"),
      rec("Big Bazaar", 4_100_00, "2026-09-01"),
    ];
    const irregular = [
      rec("Spotify", 119_00, "2026-07-01"),
      rec("Spotify", 119_00, "2026-07-20"),
      rec("Spotify", 119_00, "2026-09-01"),
    ];
    // Monthly, but a different amount every time (all within 25% of each other).
    const shopping = [
      rec("Shopping", 7_700_00, "2026-07-24"),
      rec("Shopping", 9_400_00, "2026-08-24"),
      rec("Shopping", 11_100_00, "2026-09-23"),
    ];
    expect(detectSubscriptions([...groceries, ...irregular, ...shopping], new Set())).toHaveLength(0);

    const tracked = [
      rec("Hotstar", 299_00, "2026-07-05"),
      rec("Hotstar", 299_00, "2026-08-05"),
      rec("Hotstar", 299_00, "2026-09-05"),
    ];
    expect(detectSubscriptions(tracked, new Set(["hotstar"]))).toHaveLength(0);
  });

  it("needs enough history before suggesting", () => {
    expect(
      detectSubscriptions([rec("Gym", 1_500_00, "2026-08-01"), rec("Gym", 1_500_00, "2026-09-01")], new Set()),
    ).toHaveLength(0);
    expect(
      detectSubscriptions(
        [rec("Amazon Prime", 1_499_00, "2025-10-01"), rec("Amazon Prime", 1_499_00, "2026-10-01")],
        new Set(),
      )[0]?.frequency,
    ).toBe("yearly");
  });
});

describe("matchScore", () => {
  it("prefers exact, then the most specific learned name", async () => {
    const { matchScore } = await import("@/server/services/merchant-rules");
    expect(matchScore("swiggy", "swiggy")).toBeGreaterThan(matchScore("swiggy", "swiggy order"));
    expect(matchScore("swiggy", "swiggy order")).toBeGreaterThan(0);
    expect(matchScore("amazon prime", "amazon prime video")).toBeGreaterThan(
      matchScore("amazon", "amazon prime video"),
    );
    expect(matchScore("swiggy", "swiggyx")).toBe(0);
    expect(matchScore("uber", "auto to office")).toBe(0);
  });
});
