import { eq } from "drizzle-orm";
import { addMonths, monthOf, todayInTz } from "../../src/lib/dates";
import { formatMonth } from "../../src/lib/date-format";
import * as schema from "../../src/server/db/schema";
import { listCategories } from "../../src/server/services/categories";
import { createTransaction } from "../../src/server/services/transactions";
import { listWallets } from "../../src/server/services/wallets";
import { db, expect, test } from "./support/fixtures";

// Plans and upsells only show with BILLING_ENABLED="true" and Razorpay keys in .env.local.
const billingOn =
  process.env.BILLING_ENABLED?.trim() === "true" &&
  ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_PLAN_MONTHLY", "RAZORPAY_PLAN_YEARLY"].every((k) => process.env[k]?.trim());
const paymentsOff = process.env.BILLING_ENABLED?.trim() !== "true";
const aiOn = Boolean(process.env.LLM_GROQ_API_KEY);

function makePro(userId: string) {
  return db.insert(schema.subscription).values({
    userId,
    razorpaySubscriptionId: `sub_e2e_${userId}`,
    planKey: "monthly",
    status: "active",
    currentStart: new Date(),
    currentEnd: new Date(Date.now() + 20 * 86_400_000),
  });
}

/** Six everyday entries spread over last month, enough for a report. */
async function seedLastMonth(userId: string) {
  const lastMonth = addMonths(monthOf(todayInTz("Asia/Kolkata")), -1);
  const [cash] = await listWallets(db, userId);
  const c = Object.fromEntries((await listCategories(db, userId)).map((x) => [x.name, x.id]));
  const entries = [
    ["income", 40_000_00, "01", "Salary", "Salary"],
    ["expense", 15_000_00, "05", "Rent", "Rent & Housing"],
    ["expense", 4_200_00, "08", "Big Bazaar", "Groceries"],
    ["expense", 450_00, "10", "Swiggy", "Dining Out"],
    ["expense", 450_00, "11", "Swiggy", "Dining Out"],
    ["expense", 1_200_00, "18", "Metro card", "Transport"],
  ] as const;
  for (const [type, amount, day, description, category] of entries) {
    await createTransaction(db, userId, {
      type, amount, occurredOn: `${lastMonth}-${day}`, description, notes: null, walletId: cash.id, toWalletId: null, categoryId: c[category] ?? null,
    });
  }
  return formatMonth(lastMonth);
}

test("with payments off, nothing about plans shows", async ({ signedIn: { page } }) => {
  test.skip(!paymentsOff, "Payments are switched on in .env.local");
  await page.goto("/billing");
  await expect(page.getByText("This page could not be found.")).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Your data" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Plan & billing" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Refunds & cancellation" })).toHaveCount(0);
});

test("free users see their plan and what Pro adds", async ({ signedIn: { page } }) => {
  test.skip(paymentsOff, "Payments are switched off (BILLING_ENABLED)");
  await page.goto("/billing");
  await expect(page.getByRole("heading", { name: "Your plan: Free" })).toBeVisible();
  await expect(page.getByRole("table", { name: "What Free and Pro include" })).toBeVisible();
  if (billingOn) await expect(page.getByRole("button", { name: "Get Pro" })).toBeVisible();
  else await expect(page.getByRole("heading", { name: "Pro is coming soon" })).toBeVisible();
});

test("Pro shows when it renews", async ({ signedIn: { page, userId } }) => {
  test.skip(paymentsOff, "Payments are switched off (BILLING_ENABLED)");
  await makePro(userId);
  await page.goto("/billing");
  await expect(page.getByRole("heading", { name: "Your plan: Pro" })).toBeVisible();
  await expect(page.getByText(/^Renews on \d+ \w+ \d{4} · ₹79 a month$/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Get Pro" })).toHaveCount(0);
});

test("free users who run out of questions are pointed at Pro", async ({ signedIn: { page, userId } }) => {
  test.skip(!aiOn, "No AI provider key in .env.local");
  const scope = `user:${userId}`;
  await db.insert(schema.aiUsage).values({ scope, day: new Date().toISOString().slice(0, 10), feature: "chat", count: 10 });
  try {
    await page.goto("/ask");
    await expect(page.getByText("You've used today's questions. They reset tomorrow.")).toBeVisible();
    await expect(page.getByText("0 questions left today")).toBeVisible();
    if (billingOn) await expect(page.getByRole("link", { name: "See Pro" })).toHaveAttribute("href", "/billing");
  } finally {
    await db.delete(schema.aiUsage).where(eq(schema.aiUsage.scope, scope));
  }
});

test("free users get last month's numbers, without the write-up", async ({ signedIn: { page, userId } }) => {
  const month = await seedLastMonth(userId);
  await page.goto("/insights");
  const section = page.getByRole("region", { name: month });
  await expect(section.getByRole("table", { name: "Where it went" })).toContainText("Rent & Housing");
  await expect(section.getByText("Swiggy, ₹450 on")).toBeVisible(); // possible double charge
  await expect(section.getByText("Writing your report…")).toHaveCount(0);
  await expect(section.getByRole("link", { name: "See Pro" })).toHaveCount(billingOn ? 1 : 0);
});

test("Pro users get last month written up, once", async ({ signedIn: { page, userId } }) => {
  test.skip(!aiOn, "No AI provider key in .env.local");
  test.skip(paymentsOff, "Payments are switched off (BILLING_ENABLED)");
  test.skip(test.info().project.name !== "desktop-chrome", "Server-side AI: checked once");
  await makePro(userId);
  const month = await seedLastMonth(userId);
  await page.goto("/insights");
  const section = page.getByRole("region", { name: month });
  await expect(section.getByText("Written by AI from the numbers below.")).toBeVisible({ timeout: 60_000 });
  await expect(section.getByText("Try this").first()).toBeVisible();

  // Saved: coming back doesn't write it again.
  await page.reload();
  await expect(section.getByText("Written by AI from the numbers below.")).toBeVisible();
  await expect(section.getByText("Writing your report…")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Check in on this month" })).toHaveCount(0); // under 5 entries this month
});
