import { expect, test } from "./support/fixtures";

// These use the real AI provider from .env.local, so they're skipped without a key.
test.skip(!process.env.LLM_GROQ_API_KEY, "No AI provider key in .env.local");

test("typing a note fills in the entry form", async ({ signedIn: { page } }) => {
  await page.goto("/transactions");
  const dialog = page.getByRole("dialog", { name: "New entry" });
  await expect(async () => {
    await page.getByRole("button", { name: "Add entry" }).first().click();
    await expect(dialog.getByLabel("Type it in words")).toBeVisible({ timeout: 1_500 });
  }).toPass();

  await dialog.getByLabel("Type it in words").fill("spent 240 on chai yesterday, paid cash");
  await dialog.getByRole("button", { name: "Fill in" }).click();
  await expect(dialog.getByText("Filled in from your note. Check it, then save.")).toBeVisible({ timeout: 20_000 });

  await expect(dialog.getByLabel("Amount")).toHaveValue("240.00");
  await expect(dialog.getByLabel("Paid from")).toHaveValue(/.+/);
  await expect(dialog.getByRole("radio", { name: /Dining Out/, checked: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Save entry" }).click();
  await expect(page.getByText("Entry saved")).toBeVisible();
  await expect(page.getByRole("button", { name: /chai/i })).toContainText("−₹240.00");
});

test("switching AI off hides the typing box", async ({ signedIn: { page } }) => {
  await page.goto("/settings");
  const toggle = page.getByRole("switch", { name: "AI features" });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(page.getByText("AI features switched off")).toBeVisible();

  await page.goto("/transactions");
  const dialog = page.getByRole("dialog", { name: "New entry" });
  await expect(async () => {
    await page.getByRole("button", { name: "Add entry" }).first().click();
    await expect(dialog.getByLabel("Amount")).toBeVisible({ timeout: 1_500 });
  }).toPass();
  await expect(dialog.getByLabel("Type it in words")).toHaveCount(0);
});
