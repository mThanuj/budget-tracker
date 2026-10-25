import { addMonths, todayInTz } from "../../src/lib/dates";
import { occurrence } from "../../src/lib/recurring";
import { listCategories } from "../../src/server/services/categories";
import { createRule } from "../../src/server/services/recurring";
import { createTransaction } from "../../src/server/services/transactions";
import { listWallets } from "../../src/server/services/wallets";
import { db, expect, test } from "./support/fixtures";

const today = () => todayInTz("Asia/Kolkata");

test("a recurring item starting today is recorded automatically", async ({ signedIn: { page } }) => {
  await page.goto("/recurring");
  await page.getByRole("button", { name: "New recurring item" }).click();
  const dialog = page.getByRole("dialog", { name: "New recurring item" });
  await dialog.getByLabel("Name").fill("Gym");
  await dialog.getByLabel("Amount").fill("1500");
  await expect(dialog.getByText("The first entry will be today.")).toBeVisible();
  await dialog.getByRole("button", { name: "Add recurring item" }).click();
  await expect(page.getByText("Recurring item added")).toBeVisible();

  await page.goto("/transactions");
  const row = page.getByRole("button", { name: /Gym/ });
  await expect(row).toContainText("−₹1,500.00");
  await expect(row.getByLabel("Recurring")).toBeVisible();

  await page.goto("/recurring");
  await expect(page.getByRole("listitem").filter({ hasText: "Gym" })).toContainText("Next:");
});

test("ask-first items wait on the home page until recorded", async ({ signedIn: { page, userId } }) => {
  const [cash] = await listWallets(db, userId);
  const bills = (await listCategories(db, userId)).find((c) => c.name === "Bills & Utilities")!;
  await createRule(
    db,
    userId,
    {
      type: "expense",
      amount: 1_200_00,
      description: "Electricity",
      walletId: cash.id,
      toWalletId: null,
      categoryId: bills.id,
      frequency: "monthly",
      interval: 1,
      anchorDate: today(),
      endDate: null,
      mode: "confirm",
      isSubscription: false,
    },
    today(),
  );

  await page.goto("/dashboard");
  const waiting = page.getByRole("region", { name: /Waiting for you/ });
  await expect(waiting).toContainText("Electricity");
  await waiting.getByRole("button", { name: "Record" }).click();
  const dialog = page.getByRole("dialog", { name: "Electricity" });
  await dialog.getByLabel("Amount").fill("1480");
  await dialog.getByRole("button", { name: "Record it" }).click();
  await expect(page.getByText("Electricity recorded")).toBeVisible();
  await expect(waiting).toHaveCount(0);

  await page.goto("/transactions");
  await expect(page.getByRole("button", { name: /Electricity/ })).toContainText("−₹1,480.00");
});

test("a repeating charge is suggested as a subscription", async ({ signedIn: { page, userId } }) => {
  const [cash] = await listWallets(db, userId);
  const t = today();
  const day = Math.min(Number(t.slice(8, 10)), 28);
  const anchor = `${addMonths(t.slice(0, 7), -2)}-${String(day).padStart(2, "0")}`;
  for (const n of [0, 1, 2]) {
    await createTransaction(db, userId, {
      type: "expense",
      amount: 119_00,
      description: "Spotify",
      notes: null,
      occurredOn: occurrence({ frequency: "monthly", interval: 1, anchorDate: anchor, endDate: null }, n),
      walletId: cash.id,
      toWalletId: null,
      categoryId: null,
    });
  }

  await page.goto("/recurring?view=subscriptions");
  const suggestion = page.getByRole("listitem").filter({ hasText: "looks like a monthly subscription" });
  await expect(suggestion).toContainText("Spotify");
  await suggestion.getByRole("button", { name: "Track it" }).click();
  await expect(page.getByText("Tracking Spotify")).toBeVisible();
  await expect(page.getByRole("region", { name: "Subscriptions cost you" })).toContainText("₹119.00");
  await expect(page.getByRole("listitem").filter({ hasText: "Every month" })).toContainText("Spotify");
});
