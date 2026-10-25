import { eq } from "drizzle-orm";
import * as schema from "../../src/server/db/schema";
import { listCategories } from "../../src/server/services/categories";
import { createTransaction } from "../../src/server/services/transactions";
import { listWallets } from "../../src/server/services/wallets";
import { db, expect, test } from "./support/fixtures";

async function addEntry(userId: string, description: string) {
  const [cash] = await listWallets(db, userId);
  const groceries = (await listCategories(db, userId)).find((c) => c.name === "Groceries")!;
  await createTransaction(db, userId, {
    type: "expense", amount: 1_250_50, occurredOn: "2026-10-02", description, notes: null, walletId: cash.id, toWalletId: null, categoryId: groceries.id,
  });
}

const paymentsOn = process.env.BILLING_ENABLED?.trim() === "true";

test("the policy pages are public and linked from the home page", async ({ page }) => {
  await page.goto("/");
  // Pricing and the refund policy only exist while payments are switched on.
  await expect(page.getByRole("heading", { name: "Free to use. Pro if you want more AI help." })).toHaveCount(paymentsOn ? 1 : 0);
  const policies = page.getByRole("navigation", { name: "Policies" });
  const pages: [string, string][] = [
    ["Privacy", "Privacy policy"],
    ["Terms", "Terms of use"],
    ...(paymentsOn ? [["Refunds & cancellation", "Refunds & cancellation"] as [string, string]] : []),
    ["Contact", "Contact"],
  ];
  for (const [link, heading] of pages) {
    await page.goto("/");
    await policies.getByRole("link", { name: link, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(page.getByText(/^Last updated /)).toBeVisible();
  }
  await page.goto("/refund");
  if (paymentsOn) await expect(page.getByText("Payments for Pro aren’t refunded")).toBeVisible();
  else await expect(page.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
});

test("entries download as CSV", async ({ signedIn: { page, userId } }) => {
  await addEntry(userId, "Big Bazaar, Ameerpet");
  await page.goto("/settings");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download entries (CSV)" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^clearpaisa-entries-\d{4}-\d{2}-\d{2}\.csv$/);
  const text = await (await page.request.get("/api/export")).text();
  expect(text).toContain('2026-10-02,Expense,1250.50,INR,"Big Bazaar, Ameerpet",Groceries,Cash');
});

test("someone else's export needs their own sign-in", async ({ request }) => {
  expect((await request.get("/api/export")).status()).toBe(401);
});

test("deleting the account removes everything and signs out", async ({ signedIn: { page, userId } }) => {
  await addEntry(userId, "Chai");
  await page.goto("/settings");
  await page.getByRole("button", { name: "Delete account" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Delete your account?" });
  const confirm = dialog.getByRole("button", { name: "Delete everything" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Type DELETE to confirm").fill("delete");
  await confirm.click();

  await expect(page.getByText("Your account and everything in it has been deleted.")).toBeVisible();
  expect(await db.select().from(schema.user).where(eq(schema.user.id, userId))).toHaveLength(0);
  expect(await db.select().from(schema.transaction).where(eq(schema.transaction.userId, userId))).toHaveLength(0);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/localhost:3000\/$/); // signed out
});

test("the admin page is a plain 404 for everyone else", async ({ signedIn: { page } }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Admin" })).toHaveCount(0);
});
