import { describe, expect, it } from "vitest";
import { categorySchema, fieldErrors, transactionSchema, walletSchema } from "@/lib/validation";

const WALLET = "6f1c1d5e-1c1b-4c55-9a51-2b7d6b3f2a10";
const OTHER = "0b9a8c2e-7d4f-4b1e-8f3a-5c6d7e8f9a0b";
const today = "2026-10-23";

describe("transactionSchema", () => {
  const schema = transactionSchema("INR", today);
  const base = { type: "expense", amount: "240", occurredOn: today, description: " Chai ", walletId: WALLET };

  it("parses a normal expense into minor units with trimmed text", () => {
    expect(schema.parse(base)).toEqual({
      type: "expense",
      amount: 24000,
      occurredOn: today,
      description: "Chai",
      notes: null,
      walletId: WALLET,
      toWalletId: null,
      categoryId: null,
    });
  });

  it("requires a different destination wallet for transfers and drops the category", () => {
    const missing = schema.safeParse({ ...base, type: "transfer" });
    expect(missing.success).toBe(false);
    expect(fieldErrors(missing.error!).toWalletId).toMatch(/where the money goes/);

    const same = schema.safeParse({ ...base, type: "transfer", toWalletId: WALLET });
    expect(fieldErrors(same.error!).toWalletId).toMatch(/two different/);

    const ok = schema.parse({ ...base, type: "transfer", toWalletId: OTHER, categoryId: OTHER });
    expect(ok.categoryId).toBeNull();
    expect(ok.toWalletId).toBe(OTHER);
  });

  it("drops a stray destination wallet on non-transfers", () => {
    expect(schema.parse({ ...base, toWalletId: OTHER }).toWalletId).toBeNull();
  });

  it("rejects bad amounts and out-of-range dates with friendly messages", () => {
    const errs = fieldErrors(schema.safeParse({ ...base, amount: "0", occurredOn: "2040-01-01" }).error!);
    expect(errs.amount).toMatch(/Enter an amount/);
    expect(errs.occurredOn).toMatch(/within/);
    expect(fieldErrors(schema.safeParse({ ...base, walletId: "" }).error!).walletId).toMatch(/Choose a wallet/);
  });
});

describe("walletSchema", () => {
  it("stores what a credit card owes as a negative opening balance", () => {
    const card = walletSchema("INR").parse({ name: "ICICI Card", kind: "credit_card", color: "#8a64b8", openingBalance: "1,500" });
    expect(card.openingBalanceMinor).toBe(-150000);
    const bank = walletSchema("INR").parse({ name: "SBI", kind: "bank", color: "#4a7fc1", openingBalance: "1,500" });
    expect(bank.openingBalanceMinor).toBe(150000);
  });

  it("treats an empty opening balance as zero and requires a name", () => {
    expect(walletSchema("INR").parse({ name: "Cash", kind: "cash", color: "#3f9b74", openingBalance: "" }).openingBalanceMinor).toBe(0);
    expect(fieldErrors(walletSchema("INR").safeParse({ name: "  ", kind: "cash", color: "#3f9b74" }).error!).name).toMatch(/name/);
  });
});

describe("categorySchema", () => {
  it("only accepts icons from the picker", () => {
    expect(categorySchema.safeParse({ name: "Pets", kind: "expense", icon: "paw-print", color: "#8a7f72" }).success).toBe(true);
    expect(categorySchema.safeParse({ name: "Pets", kind: "expense", icon: "skull", color: "#8a7f72" }).success).toBe(false);
  });
});
