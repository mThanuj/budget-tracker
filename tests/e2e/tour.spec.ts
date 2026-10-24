import { addDays, todayInTz } from "../../src/lib/dates";
import { createBudget } from "../../src/server/services/budgets";
import { listCategories } from "../../src/server/services/categories";
import { addContribution, createGoal } from "../../src/server/services/goals";
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

  // Earlier months for the income vs spending chart.
  for (const back of [1, 2, 3]) {
    const d = addDays(today, -31 * back);
    await add("income", 42_000_00, sbi.id, d, "Salary", { categoryId: cat.Salary });
    await add("expense", 15_000_00, sbi.id, d, "Rent", { categoryId: cat["Rent & Housing"] });
    await add("expense", (6_000 + back * 1_700) * 100, card.id, d, "Shopping", { categoryId: cat.Shopping });
  }

  const month = today.slice(0, 7);
  await createBudget(db, userId, { categoryId: null, amount: 30_000_00, rollover: false }, month);
  await createBudget(db, userId, { categoryId: cat["Dining Out"], amount: 300_00, rollover: false }, month);
  await createBudget(db, userId, { categoryId: cat.Groceries, amount: 6_000_00, rollover: true }, month);
  await createBudget(db, userId, { categoryId: cat.Fuel, amount: 1_200_00, rollover: false }, month);
  const phone = await createGoal(db, userId, { name: "New phone", target: 60_000_00, targetDate: addDays(today, 200), icon: "smartphone", color: "#4a7fc1" });
  await addContribution(db, userId, phone.id, { direction: "add", amount: 16_000_00, occurredOn: today, note: null });
  const trip = await createGoal(db, userId, { name: "Goa trip", target: 25_000_00, targetDate: null, icon: "plane", color: "#2f8f9d" });
  await addContribution(db, userId, trip.id, { direction: "add", amount: 13_000_00, occurredOn: today, note: null });

  const shot = async (name: string) => {
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `tests/e2e/.tour/${info.project.name}-${name}.png`, fullPage: true });
  };

  // Guards against a dev server serving stale CSS (the chart colors are validated values).
  await page.goto("/dashboard");
  const chart = await page.evaluate(() => {
    const css = getComputedStyle(document.documentElement);
    return [css.getPropertyValue("--chart-1").trim(), css.getPropertyValue("--chart-2").trim()];
  });
  expect(chart).toEqual(["#0a8f80", "#eb6834"]);

  for (const [path, name] of [
    ["/dashboard", "dashboard"],
    ["/transactions", "transactions"],
    ["/budgets", "budgets"],
    ["/goals", "goals"],
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
