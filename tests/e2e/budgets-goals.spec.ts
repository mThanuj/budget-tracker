import { todayInTz } from "../../src/lib/dates";
import { listCategories } from "../../src/server/services/categories";
import { createTransaction } from "../../src/server/services/transactions";
import { listWallets } from "../../src/server/services/wallets";
import { db, expect, test } from "./support/fixtures";

async function spend(userId: string, amount: number, categoryName: string) {
  const [cash] = await listWallets(db, userId);
  const category = (await listCategories(db, userId)).find((c) => c.name === categoryName)!;
  await createTransaction(db, userId, {
    type: "expense",
    amount,
    occurredOn: todayInTz("Asia/Kolkata"),
    description: "Test spend",
    notes: null,
    walletId: cash.id,
    toWalletId: null,
    categoryId: category.id,
  });
}

test("set a monthly limit and see what's left on the home page", async ({ signedIn: { page, userId } }) => {
  await spend(userId, 2_000_00, "Groceries");
  await page.goto("/budgets");
  await page.getByRole("button", { name: "Set a monthly limit" }).click();
  const dialog = page.getByRole("dialog", { name: "Set a monthly limit" });
  await dialog.getByLabel("How much can you spend in a month?").fill("10000");
  await dialog.getByRole("button", { name: "Add budget" }).click();
  await expect(page.getByText("Budget added")).toBeVisible();
  await expect(page.getByRole("region", { name: "Monthly spending limit" })).toContainText("₹8,000.00");

  await page.goto("/dashboard");
  const hero = page.getByRole("region", { name: "Left to spend this month" });
  await expect(hero).toContainText("₹8,000.00");
  await expect(hero.getByRole("meter")).toHaveAttribute("aria-valuenow", "20");
});

test("a category budget warns at 80% and the alert can be dismissed", async ({ signedIn: { page, userId } }) => {
  await spend(userId, 850_00, "Dining Out");
  await page.goto("/budgets");
  await page.getByRole("button", { name: "Add budget" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a budget" });
  await dialog.getByLabel("Category").selectOption({ label: "Dining Out" });
  await dialog.getByLabel("Monthly limit").fill("1000");
  await dialog.getByRole("button", { name: "Add budget" }).click();

  const row = page.getByRole("listitem").filter({ hasText: "Dining Out" });
  await expect(row).toContainText("Almost used up");
  await expect(row).toContainText("₹150.00 left");

  await page.goto("/dashboard");
  const alert = page
    .getByRole("list", { name: "Alerts" })
    .getByRole("listitem")
    .filter({ hasText: "85% of your Dining Out budget used" });
  await expect(alert).toBeVisible();
  // The alert hides instantly; wait for the dismissal to be saved before reloading,
  // otherwise the reload cancels the request.
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && "next-action" in r.request().headers());
  await alert.getByRole("button", { name: /^Dismiss/ }).click();
  await expect(alert).toHaveCount(0);
  expect((await saved).ok()).toBe(true);
  await page.reload();
  await expect(page.getByText("85% of your Dining Out budget used")).toHaveCount(0);
});

test("save towards a goal and see the progress", async ({ signedIn: { page } }) => {
  await page.goto("/goals");
  await page.getByRole("button", { name: "New goal" }).click();
  const dialog = page.getByRole("dialog", { name: "New goal" });
  await dialog.getByLabel("What are you saving for?").fill("New phone");
  await dialog.getByLabel("Amount needed").fill("20000");
  await dialog.getByRole("button", { name: "Add goal" }).click();
  await expect(page.getByText("Goal added")).toBeVisible();

  const card = page.getByRole("article").filter({ hasText: "New phone" });
  await card.getByRole("button", { name: "Add money" }).click();
  const add = page.getByRole("dialog", { name: "New phone" });
  await add.getByLabel("Amount").fill("5000");
  await add.getByRole("button", { name: "Add money" }).click();
  await expect(card).toContainText("₹5,000.00");
  await expect(card.getByRole("meter")).toHaveAttribute("aria-valuenow", "25");

  // Can't take out more than is saved.
  await card.getByRole("button", { name: "Take out" }).click();
  const take = page.getByRole("dialog", { name: "New phone" });
  await take.getByLabel("Amount").fill("6000");
  await take.getByRole("button", { name: "Take out" }).click();
  await expect(take.getByText("You can't take out more than is saved for this goal.")).toBeVisible();
});
