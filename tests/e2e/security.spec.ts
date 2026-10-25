import { expect, test } from "./support/fixtures";

test("every response carries the security headers", async ({ page }) => {
  const res = await page.goto("/");
  const h = res!.headers();
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  const csp = h["content-security-policy"];
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("base-uri 'self'");
  // The landing page rendered fine under the policy.
  await expect(page.getByRole("heading", { name: "Know where your money goes." })).toBeVisible();
});

test("the app shell renders under the CSP with no blocked-resource breakage", async ({ signedIn: { page } }) => {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text());
  });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto("/transactions");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(violations, violations.join("\n")).toEqual([]);
});
