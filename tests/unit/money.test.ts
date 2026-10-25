import { describe, expect, it } from "vitest";
import {
  currencyExponent,
  currencySymbol,
  formatMoney,
  isValidCurrency,
  minorToInput,
  parseMoney,
} from "@/lib/money";

describe("currencyExponent", () => {
  it("uses each currency's own number of decimals", () => {
    expect(currencyExponent("INR")).toBe(2);
    expect(currencyExponent("USD")).toBe(2);
    expect(currencyExponent("JPY")).toBe(0);
    expect(currencyExponent("KWD")).toBe(3);
  });
});

describe("isValidCurrency", () => {
  it("accepts ISO codes and rejects junk", () => {
    expect(isValidCurrency("INR")).toBe(true);
    expect(isValidCurrency("inr")).toBe(false);
    expect(isValidCurrency("XYZW")).toBe(false);
    expect(isValidCurrency("XYZ")).toBe(false); // well-formed but not a real currency
    expect(isValidCurrency("")).toBe(false);
  });
});

describe("parseMoney", () => {
  it("parses plain and grouped amounts into minor units", () => {
    expect(parseMoney("40", "INR")).toBe(4000);
    expect(parseMoney("1,234.5", "INR")).toBe(123450);
    expect(parseMoney("1,00,000", "INR")).toBe(10000000);
    expect(parseMoney(" 0.05 ", "USD")).toBe(5);
    expect(parseMoney("12.", "USD")).toBe(1200);
  });

  it("respects currency precision", () => {
    expect(parseMoney("500", "JPY")).toBe(500);
    expect(parseMoney("500.5", "JPY")).toBeNull();
    expect(parseMoney("1.234", "KWD")).toBe(1234);
    expect(parseMoney("1.234", "USD")).toBeNull();
  });

  it("rejects negative, malformed and absurd values", () => {
    expect(parseMoney("", "INR")).toBeNull();
    expect(parseMoney("-5", "INR")).toBeNull();
    expect(parseMoney("abc", "INR")).toBeNull();
    expect(parseMoney("1.2.3", "INR")).toBeNull();
    expect(parseMoney("1e5", "INR")).toBeNull();
    expect(parseMoney("1000000000", "INR")).toBeNull();
  });
});

describe("formatMoney", () => {
  it("formats INR with Indian grouping", () => {
    expect(formatMoney(10000000, "INR")).toBe("₹1,00,000.00");
  });

  it("formats other currencies with their own decimals", () => {
    expect(formatMoney(123450, "USD")).toBe("$1,234.50");
    expect(formatMoney(500, "JPY")).toBe("¥500");
  });

  it("supports signs and compact notation", () => {
    expect(formatMoney(-4000, "USD")).toBe("-$40.00");
    expect(formatMoney(4000, "USD", { signDisplay: "always" })).toBe("+$40.00");
    expect(formatMoney(12500000, "USD", { compact: true })).toBe("$125K");
  });
});

describe("minorToInput", () => {
  it("round-trips with parseMoney", () => {
    expect(minorToInput(123450, "INR")).toBe("1234.50");
    expect(minorToInput(5, "USD")).toBe("0.05");
    expect(minorToInput(500, "JPY")).toBe("500");
    expect(minorToInput(1234, "KWD")).toBe("1.234");
    for (const v of [0, 1, 99, 100, 123456789]) {
      expect(parseMoney(minorToInput(v, "INR"), "INR")).toBe(v);
    }
  });
});

describe("whole amounts without zero decimals", () => {
  it("trims only when the amount is whole", () => {
    expect(formatMoney(2_380_00, "INR", { trimWhole: true })).toBe("₹2,380");
    expect(formatMoney(2_380_50, "INR", { trimWhole: true })).toBe("₹2,380.50");
    expect(formatMoney(2_380_00, "INR")).toBe("₹2,380.00"); // default unchanged
    expect(formatMoney(-500_00, "INR", { trimWhole: true })).toBe("-₹500");
  });

  it("works for currencies with 0 or 3 decimals, not just 2", () => {
    expect(formatMoney(1500, "JPY", { trimWhole: true })).toBe("¥1,500");
    // Intl puts a non-breaking space between a currency code and the number.
    expect(formatMoney(1_000_000, "KWD", { trimWhole: true })).toBe("KWD\u00a01,000");
    expect(formatMoney(1_000_500, "KWD", { trimWhole: true })).toBe("KWD\u00a01,000.500");
  });

  it("keeps compact notation as it was", () => {
    expect(formatMoney(1_25_000_00, "INR", { compact: true, trimWhole: true })).toBe(formatMoney(1_25_000_00, "INR", { compact: true }));
  });

  it("trims input values the same way", () => {
    expect(minorToInput(15_000_00, "INR", { trimWhole: true })).toBe("15000");
    expect(minorToInput(15_000_50, "INR", { trimWhole: true })).toBe("15000.50");
    expect(minorToInput(15_000_00, "INR")).toBe("15000.00");
    expect(minorToInput(1_000_000, "KWD", { trimWhole: true })).toBe("1000");
  });
});

describe("currencySymbol", () => {
  it("matches the symbol used in formatted amounts", () => {
    expect(currencySymbol("INR")).toBe("₹");
    expect(currencySymbol("USD")).toBe("$");
    expect(formatMoney(100, "AED")).toContain(currencySymbol("AED"));
  });
});
