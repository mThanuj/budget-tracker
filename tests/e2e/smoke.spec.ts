import type { Page, Route } from "@playwright/test";
import { expect, test } from "./support/fixtures";

/** Opens the entry dialog, retrying until the page has hydrated. */
async function openNewEntry(page: Page) {
  const dialog = page.getByRole("dialog", { name: "New entry" });
  await expect(async () => {
    await page.getByRole("button", { name: "Add entry" }).first().click();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await expect(dialog.getByLabel("Amount")).toBeVisible(); // form data loaded
  return dialog;
}

const walletCard = (page: Page, name: string) =>
  page.getByRole("article").filter({ has: page.getByRole("heading", { name: new RegExp(`^${name}`) }) });

test("signed-out visitors are sent to the landing page", async ({ page }) => {
  // Anything that isn't a public page, including a mistyped URL: the proxy
  // can't tell a missing page from a private one, so it never reveals which.
  await page.goto("/no-such-page");
  await expect(page).toHaveURL(/localhost:3000\/$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/localhost:3000\/$/);
  await expect(page.getByRole("heading", { name: "Know where your money goes." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
});

test("unknown pages explain what happened and lead back home", async ({ signedIn: { page } }) => {
  const res = await page.goto("/no-such-page");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
  await page.getByRole("link", { name: "Go to Home" }).click();
  await expect(page).toHaveURL(/\/dashboard$/); // signed in, home is the dashboard
});

test("new users choose currency and time zone before reaching home", async ({ newUser: { page } }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole("heading", { name: "Welcome, Asha." })).toBeVisible();
  await page.getByLabel("Currency").selectOption("USD");
  await page.getByRole("button", { name: "Save and continue" }).click();
  // Next comes the optional setup questions.
  await expect(page).toHaveURL(/\/setup$/);
  await page.getByRole("link", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: /, Asha\.$/ })).toBeVisible();
});

test("add, edit and delete an entry", async ({ signedIn: { page } }) => {
  await page.goto("/transactions");
  await expect(page.getByRole("heading", { name: /^Nothing recorded in/ })).toBeVisible();

  const dialog = await openNewEntry(page);
  await dialog.getByLabel("Amount").fill("240");
  await dialog.getByLabel("What was it for?").fill("Chai and samosa");
  await dialog.getByRole("radio", { name: "Dining Out" }).click();
  await dialog.getByRole("button", { name: "Save entry" }).click();
  await expect(page.getByText("Entry saved")).toBeVisible();

  const row = page.getByRole("button", { name: /Chai and samosa/ });
  await expect(row).toContainText("−₹240.00");
  await expect(row).toContainText("Dining Out · Cash");
  await expect(page.getByRole("definition").filter({ hasText: "₹240.00" }).first()).toBeVisible();

  await row.click();
  const edit = page.getByRole("dialog", { name: "Edit entry" });
  await expect(edit.getByLabel("Amount")).toHaveValue("240.00");
  await edit.getByLabel("Amount").fill("250");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(row).toContainText("−₹250.00");

  await row.click();
  await page.getByRole("dialog", { name: "Edit entry" }).getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete entry" }).click();
  await expect(page.getByText("Entry deleted")).toBeVisible();
  await expect(row).toHaveCount(0);
});

test("shows a friendly error for a missing amount, keeping what was typed", async ({ signedIn: { page } }) => {
  await page.goto("/transactions");
  const dialog = await openNewEntry(page);
  await dialog.getByLabel("What was it for?").fill("Bus pass");
  await dialog.getByRole("button", { name: "Save entry" }).click();
  await expect(dialog.getByText("Enter an amount like 250 or 1,250.50.")).toBeVisible();
  await expect(dialog.getByLabel("What was it for?")).toHaveValue("Bus pass");
});

test("a save that doesn't reach the server can be retried without retyping", async ({ signedIn: { page } }) => {
  await page.goto("/transactions");
  const dialog = await openNewEntry(page);
  await dialog.getByLabel("Amount").fill("75");
  await dialog.getByLabel("What was it for?").fill("Auto fare");

  // Server actions are POSTs carrying a Next-Action header: drop them, as a lost connection would.
  const offline = (route: Route) =>
    route.request().method() === "POST" && route.request().headers()["next-action"]
      ? route.abort("internetdisconnected")
      : route.fallback();
  await page.route("**/*", offline);
  await dialog.getByRole("button", { name: "Save entry" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("That didn't go through. Check your connection and try again.");
  await expect(dialog.getByLabel("Amount")).toHaveValue("75");
  await expect(dialog.getByLabel("What was it for?")).toHaveValue("Auto fare");

  await page.unroute("**/*", offline);
  await dialog.getByRole("button", { name: "Save entry" }).click();
  await expect(page.getByText("Entry saved")).toBeVisible();
  await expect(page.getByRole("button", { name: /Auto fare/ })).toContainText("−₹75.00");
});

test("add a bank wallet and move money between wallets", async ({ signedIn: { page } }) => {
  await page.goto("/wallets");
  await expect(walletCard(page, "Cash")).toContainText("Default");

  await page.getByRole("button", { name: "Add wallet" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a wallet" });
  await dialog.getByLabel("Name").fill("SBI Debit");
  await dialog.getByRole("radio", { name: /Bank account/ }).click();
  await dialog.getByLabel("How much is in it right now?").fill("1,000");
  await dialog.getByRole("button", { name: "Add wallet" }).click();
  await expect(page.getByText("Wallet added")).toBeVisible();
  await expect(walletCard(page, "SBI Debit")).toContainText("₹1,000.00");

  await page.getByRole("button", { name: "Move money" }).click();
  const move = page.getByRole("dialog", { name: "New entry" });
  await expect(move.getByLabel("From")).toBeVisible();
  await move.getByLabel("Amount").fill("400");
  await move.getByLabel("From").selectOption({ label: "SBI Debit" });
  await move.getByLabel("To").selectOption({ label: "Cash" });
  await move.getByRole("button", { name: "Save entry" }).click();

  await expect(walletCard(page, "SBI Debit")).toContainText("₹600.00");
  await expect(walletCard(page, "Cash")).toContainText("₹400.00");
  // Moving money doesn't change the total.
  await expect(page.getByText("Total across wallets").locator("..")).toContainText("₹1,000.00");
});

test("credit cards show what you owe", async ({ signedIn: { page } }) => {
  await page.goto("/wallets");
  await page.getByRole("button", { name: "Add wallet" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a wallet" });
  await dialog.getByLabel("Name").fill("ICICI Credit Card");
  await dialog.getByRole("radio", { name: /Credit card/ }).click();
  await dialog.getByLabel("How much do you owe on it right now?").fill("1500");
  await dialog.getByRole("button", { name: "Add wallet" }).click();

  const card = walletCard(page, "ICICI Credit Card");
  await expect(card).toContainText("Owed");
  await expect(card).toContainText("₹1,500.00");

  const entry = await openNewEntry(page);
  await entry.getByLabel("Amount").fill("500");
  await entry.getByLabel("Paid from").selectOption({ label: "ICICI Credit Card" });
  await entry.getByRole("button", { name: "Save entry" }).click();
  await expect(card).toContainText("₹2,000.00");
});

test("add and archive a category", async ({ signedIn: { page } }) => {
  await page.goto("/categories");
  await page.getByRole("button", { name: "Add category" }).click();
  const dialog = page.getByRole("dialog", { name: "New spending category" });
  await dialog.getByLabel("Name").fill("Pets");
  await dialog.getByRole("radio", { name: "paw print" }).click();
  await dialog.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByText("Category added")).toBeVisible();

  await page.getByRole("button", { name: "Actions for Pets" }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await expect(page.getByText("Category archived")).toBeVisible();
  await page.getByText("Archived (1)").click();
  await expect(page.getByRole("listitem").filter({ hasText: "Pets" })).toContainText("Archived");
});
