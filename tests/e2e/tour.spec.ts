import { addDays, todayInTz } from "../../src/lib/dates";
import { listCategories } from "../../src/server/services/categories";
import { createTransaction } from "../../src/server/services/transactions";
import { createWallet, listWallets } from "../../src/server/services/wallets";
import { db, expect, test } from "./support/fixtures";

// Not a behavior test: fills an account with realistic data and saves
// screenshots of every page (tests/e2e/.tour/) for design review.

test("visual tour", async ({ signedIn: { page, userId } }, info) => {
  const today = todayInTz("Asia/Kolkata");
  const day = (n: number) => addDays(today, -n);
  const [cash] = await listWallets(db, userId);
  const sbi = await createWallet(db, userId, { name: "SBI Debit", kind: "bank", color: "#4a7fc1", openingBalanceMinor: 25_000_00 });
  const card = await createWallet(db, userId, { name: "ICICI Credit Card", kind: "credit_card", color: "#8a64b8", openingBalanceMinor: -3_200_00 });
  const cat = Object.fromEntries((await listCategories(db, userId)).map((c) => [c.name, c.id]));
  const add = (type: "income" | "expense" | "transfer", amount: number, walletId: string, occurredOn: string, description: string, extra: { categoryId?: string; toWalletId?: string } = {}) =>
    createTransaction(db, userId, { type, amount, walletId, occurredOn, description, notes: null, categoryId: extra.categoryId ?? null, toWalletId: extra.toWalletId ?? null });

  await add("income", 42_000_00, sbi.id, day(6), "October salary", { categoryId: cat.Salary });
  await add("expense", 15_000_00, sbi.id, day(6), "Rent", { categoryId: cat["Rent & Housing"] });
  await add("expense", 2_380_00, sbi.id, day(4), "Big Bazaar", { categoryId: cat.Groceries });
  await add("expense", 649_00, card.id, day(3), "Netflix", { categoryId: cat.Subscriptions });
  await add("expense", 1_150_00, card.id, day(2), "Petrol", { categoryId: cat.Fuel });
  await add("transfer", 5_000_00, sbi.id, day(1), "ATM withdrawal", { toWalletId: cash.id });
  await add("expense", 240_00, cash.id, day(0), "Chai and samosa", { categoryId: cat["Dining Out"] });
  await add("expense", 120_00, cash.id, day(0), "Auto to office", { categoryId: cat.Transport });

  const shot = async (name: string) => {
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `tests/e2e/.tour/${info.project.name}-${name}.png`, fullPage: true });
  };

  for (const [path, name] of [
    ["/dashboard", "dashboard"],
    ["/transactions", "transactions"],
    ["/wallets", "wallets"],
    ["/categories", "categories"],
    ["/settings", "settings"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await shot(name);
  }

  await page.goto("/transactions");
  await expect(async () => {
    await page.getByRole("button", { name: "Add entry" }).first().click();
    await expect(page.getByRole("dialog", { name: "New entry" }).getByLabel("Amount")).toBeVisible({ timeout: 1_500 });
  }).toPass();
  await page.getByRole("dialog").getByRole("radio", { name: "Groceries" }).click();
  await shot("new-entry");
});
