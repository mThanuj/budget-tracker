import { describe, expect, it } from "vitest";
import { niceTicks } from "@/lib/chart-scale";
import { currencyOptions, normalizeTimeZone, timeZoneOptions } from "@/lib/preferences-options";
import { userCurrency, userTimeZone, userToday } from "@/lib/user-prefs";
import { describeBalance } from "@/lib/wallets";

describe("chart axis ticks", () => {
  it("covers the largest value with round steps", () => {
    expect(niceTicks(42_000)).toEqual([0, 10_000, 20_000, 30_000, 40_000, 50_000]);
    expect(niceTicks(1_000)).toEqual([0, 250, 500, 750, 1_000]);
    expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8]);
  });

  it("is a single zero tick for an empty chart", () => {
    expect(niceTicks(0)).toEqual([0]);
    expect(niceTicks(-5)).toEqual([0]);
  });

  it("always reaches at least the maximum", () => {
    for (const max of [1, 99, 101, 12_345, 9_99_999]) expect(niceTicks(max).at(-1)!).toBeGreaterThanOrEqual(max);
  });
});

describe("wallet balance wording", () => {
  it("shows a card's negative balance as an amount owed, never a minus sign", () => {
    expect(describeBalance("credit_card", -1_500_00, "INR")).toEqual({
      label: "Owed",
      amount: "₹1,500.00",
      tone: "owed",
    });
    expect(describeBalance("credit_card", 200_00, "INR")).toMatchObject({ label: "Credit", tone: "positive" });
    expect(describeBalance("credit_card", 0, "INR")).toMatchObject({ label: "Nothing owed", tone: "neutral" });
  });

  it("flags an overdrawn bank account", () => {
    expect(describeBalance("bank", -50_00, "INR")).toMatchObject({ label: "Balance", tone: "owed" });
    expect(describeBalance("cash", 4_283_00, "INR")).toEqual({
      label: "Balance",
      amount: "₹4,283.00",
      tone: "neutral",
    });
  });
});

describe("preference options", () => {
  it("normalises legacy time zone names so a place never appears twice", () => {
    expect(normalizeTimeZone("Asia/Calcutta")).toBe("Asia/Kolkata");
    expect(normalizeTimeZone("Europe/Kiev")).toBe("Europe/Kyiv");
    expect(normalizeTimeZone("Asia/Kolkata")).toBe("Asia/Kolkata");
  });

  it("lists each time zone once, including one asked for", () => {
    const at = new Date("2026-10-24T12:00:00Z");
    const values = timeZoneOptions(["Asia/Calcutta"], at).map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values).toContain("Asia/Kolkata");
    expect(values).not.toContain("Asia/Calcutta");
  });

  it("offers INR first among common currencies, and no duplicates overall", () => {
    const { common, all } = currencyOptions();
    expect(common[0].value).toBe("INR");
    expect(new Set(all.map((o) => o.value)).size).toBe(all.length);
  });
});

describe("user preferences", () => {
  it("fills in the defaults the auth library types as optional", () => {
    expect(userCurrency({})).toBe("INR");
    expect(userCurrency({ currency: null })).toBe("INR");
    expect(userCurrency({ currency: "USD" })).toBe("USD");
    expect(userTimeZone({ timezone: undefined })).toBe("Asia/Kolkata");
  });

  it("works out today where the user lives, not on the server's clock", () => {
    const lateEveningUtc = new Date("2026-10-23T20:00:00Z"); // already the 24th in India
    expect(userToday({ timezone: "Asia/Kolkata" }, lateEveningUtc)).toBe("2026-10-24");
    expect(userToday({ timezone: "America/New_York" }, lateEveningUtc)).toBe("2026-10-23");
    expect(userToday({}, lateEveningUtc)).toBe("2026-10-24"); // default zone
  });
});
