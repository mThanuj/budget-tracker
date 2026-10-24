import { expect, test } from "./support/fixtures";

test("plan a budget by filling in the setup rows", async ({ newUser: { page } }) => {
  await page.goto("/setup");
  const next = () => page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Where do you keep your money?" })).toBeVisible();
  await expect(page.getByText("You already have: Cash.")).toBeVisible();
  await page.getByRole("button", { name: "Add one" }).click();
  await page.getByLabel("Name").fill("SBI Savings");
  await page.getByLabel("Balance now").fill("20000");
  await next();

  await expect(page.getByRole("heading", { name: "How much money comes in each month?" })).toBeVisible();
  await page.getByRole("button", { name: "Add one" }).click();
  await page.getByLabel("Name").fill("Salary");
  await page.getByLabel("Amount a month").fill("42000");
  await page.getByLabel("Day (1–31)").fill("1");
  await next();

  await expect(page.getByRole("heading", { name: "What do you pay every month, no matter what?" })).toBeVisible();
  await page.getByRole("button", { name: "Add one" }).click();
  await page.getByLabel("Name").fill("Rent");
  await page.getByLabel("Amount", { exact: true }).fill("15000");
  await page.getByLabel("Day", { exact: true }).fill("5");
  await next();

  await page.getByRole("button", { name: "Groceries" }).click();
  await next();
  await next(); // no goals

  await expect(page.getByRole("heading", { name: "Here's your starter plan" })).toBeVisible();
  await expect(page.getByLabel("Monthly spending limit")).toHaveValue("33500");
  await expect(page.getByLabel("Groceries budget")).toHaveValue(/\d+/);
  await page.getByRole("button", { name: "Apply this plan" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("region", { name: "Left to spend this month" })).toContainText("₹33,500.00");
  await page.goto("/recurring");
  await expect(page.getByRole("listitem").filter({ hasText: "Salary" })).toContainText("Every month on the 1st");
  await expect(page.getByRole("listitem").filter({ hasText: "Rent" })).toContainText("Every month on the 5th");
});
