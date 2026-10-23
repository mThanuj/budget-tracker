import { describe, expect, it } from "vitest";
import {
  currencyExponent,
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
