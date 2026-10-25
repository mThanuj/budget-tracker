import { addDays, todayInTz } from "../../src/lib/dates";
import { createBudget } from "../../src/server/services/budgets";
import { listCategories } from "../../src/server/services/categories";
import { addContribution, createGoal } from "../../src/server/services/goals";
import { createRule, trackSubscription } from "../../src/server/services/recurring";
import { createTransaction } from "../../src/server/services/transactions";
import { createWallet, listWallets } from "../../src/server/services/wallets";
import * as schema from "../../src/server/db/schema";
import { db, expect, test } from "./support/fixtures";

// Not a behavior test: fills an account with realistic data and saves
// screenshots of every page (tests/e2e/.tour/) for design review.
// AI on, so the screenshots show what users see (nothing here calls the model
// except the Pro report, which only runs with LIVE_AI=1).
test.use({ ai: true });

test("visual tour", async ({ signedIn: { page, userId } }, info) => {
  // ~20 pages (each compiled on first visit by a fresh dev server) plus a real AI report.
  test.setTimeout(150_000);
  const today = todayInTz("Asia/Kolkata");
  const day = (n: number) => addDays(today, -n);
  const [cash] = await listWallets(db, userId);
  const sbi = await createWallet(db, userId, {
    name: "SBI Debit",
    kind: "bank",
    color: "#4a7fc1",
    openingBalanceMinor: 25_000_00,
  });
  const card = await createWallet(db, userId, {
    name: "ICICI Credit Card",
    kind: "credit_card",
    color: "#8a64b8",
    openingBalanceMinor: -3_200_00,
  });
  const cat = Object.fromEntries((await listCategories(db, userId)).map((c) => [c.name, c.id]));
  const add = (
    type: "income" | "expense" | "transfer",
    amount: number,
    walletId: string,
    occurredOn: string,
    description: string,
    extra: { categoryId?: string; toWalletId?: string } = {},
  ) =>
    createTransaction(db, userId, {
      type,
      amount,
      walletId,
      occurredOn,
      description,
      notes: null,
      categoryId: extra.categoryId ?? null,
      toWalletId: extra.toWalletId ?? null,
    });

  await add("income", 42_000_00, sbi.id, day(6), "October salary", { categoryId: cat.Salary });
  await add("expense", 15_000_00, sbi.id, day(6), "Rent", { categoryId: cat["Rent & Housing"] });
  await add("expense", 2_380_00, sbi.id, day(4), "Big Bazaar", { categoryId: cat.Groceries });
  await add("expense", 299_00, card.id, day(3), "Hotstar", { categoryId: cat.Subscriptions });
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
  const phone = await createGoal(db, userId, {
    name: "New phone",
    target: 60_000_00,
    targetDate: addDays(today, 200),
    icon: "smartphone",
    color: "#4a7fc1",
  });
  await addContribution(db, userId, phone.id, { direction: "add", amount: 16_000_00, occurredOn: today, note: null });
  const trip = await createGoal(db, userId, {
    name: "Goa trip",
    target: 25_000_00,
    targetDate: null,
    icon: "plane",
    color: "#2f8f9d",
  });
  await addContribution(db, userId, trip.id, { direction: "add", amount: 13_000_00, occurredOn: today, note: null });

  // Recurring items: an ask-first bill due today, rent and salary coming up, and
  // a tracked subscription whose price went up.
  const rule = (over: Partial<Parameters<typeof createRule>[2]>) =>
    createRule(
      db,
      userId,
      {
        type: "expense",
        amount: 15_000_00,
        description: "Rent",
        walletId: sbi.id,
        toWalletId: null,
        categoryId: cat["Rent & Housing"],
        frequency: "monthly",
        interval: 1,
        anchorDate: addDays(today, 2),
        endDate: null,
        mode: "auto",
        isSubscription: false,
        ...over,
      },
      today,
    );
  await rule({});
  await rule({
    type: "income",
    description: "Salary",
    amount: 42_000_00,
    categoryId: cat.Salary,
    anchorDate: addDays(today, 8),
  });
  await rule({
    description: "Electricity",
    amount: 1_200_00,
    categoryId: cat["Bills & Utilities"],
    anchorDate: today,
    mode: "confirm",
  });
  for (const [back, amount] of [
    [90, 649_00],
    [60, 649_00],
    [30, 649_00],
    [0, 799_00],
  ] as const) {
    await add("expense", amount, card.id, addDays(today, -back), "Netflix", { categoryId: cat.Subscriptions });
  }
  for (const back of [56, 28, 0]) {
    await add("expense", 119_00, cash.id, addDays(today, -back), "Spotify", { categoryId: cat.Subscriptions });
  }
  await trackSubscription(db, userId, "netflix", today);

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
  // Newer utilities too: a link must be the brand teal, or the dev server is
  // serving an old stylesheet (fix: stop it, `rm -rf .next/dev`, start again).
  const linkColor = await page.getByRole("link", { name: "All budgets" }).evaluate((el) => getComputedStyle(el).color);
  expect(linkColor, "stale dev CSS: rm -rf .next/dev and restart pnpm dev").toBe("rgb(15, 110, 102)");

  for (const [path, name] of [
    ["/dashboard", "dashboard"],
    ["/transactions", "transactions"],
    ["/budgets", "budgets"],
    ["/goals", "goals"],
    ["/recurring", "recurring"],
    ["/recurring?view=subscriptions", "subscriptions"],
    ["/wallets", "wallets"],
    ["/categories", "categories"],
    ["/settings", "settings"],
    ["/ask", "ask"],
    ["/insights", "insights"],
    ...(process.env.BILLING_ENABLED?.trim() === "true" ? ([["/billing", "billing"]] as const) : []),
    ["/setup", "setup"],
    ["/privacy", "privacy"],
    ["/contact", "contact"],
    ["/no-such-page", "not-found"],
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

  // Pro pages, while payments are on. The written report calls the real AI, so only once (desktop) and only with LIVE_AI=1.
  if (process.env.BILLING_ENABLED?.trim() !== "true") return;
  await db.insert(schema.subscription).values({
    userId,
    razorpaySubscriptionId: `sub_tour_${userId}`,
    planKey: "yearly",
    status: "active",
    currentStart: new Date(),
    currentEnd: new Date(Date.now() + 200 * 86_400_000),
  });
  await page.goto("/billing");
  await expect(page.getByRole("heading", { name: "Your plan: Pro" })).toBeVisible();
  await shot("billing-pro");
  if (process.env.LIVE_AI === "1" && process.env.LLM_GROQ_API_KEY && info.project.name === "desktop-chrome") {
    await page.goto("/insights");
    await expect(page.getByText("Written by AI from the numbers below.")).toBeVisible({ timeout: 60_000 });
    await shot("insights-pro");
  }
});

test("visual tour: landing page", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Know where your money goes." })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `tests/e2e/.tour/${info.project.name}-landing.png`, fullPage: true });
});
