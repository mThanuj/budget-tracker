import { expect, test } from "./support/fixtures";

test("keyboard users can skip past the navigation", async ({ signedIn: { page } }) => {
  test.skip(test.info().project.name !== "desktop-chrome", "Tab navigation is a keyboard (desktop) concern");
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible(); // hidden until focused
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main")).toBeFocused();
});

test("animations and transitions stop when the device asks for less motion", async ({ signedIn: { page } }) => {
  const duration = async () =>
    page.getByRole("button", { name: "Add entry" }).first().evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await duration()).toBeGreaterThan(0.05); // normal: buttons ease between states

  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await duration()).toBeLessThan(0.001);
});
