import { expect, test } from "./support/fixtures";

const cspViolations = (page: import("@playwright/test").Page) => {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text());
  });
  return violations;
};

test("every response carries the security headers", async ({ page }) => {
  const violations = cspViolations(page);
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
  expect(violations, violations.join("\n")).toEqual([]);
});

test("every script on a page carries that response's nonce, new for each response (D-027)", async ({ request }) => {
  const nonceOf = (csp: string | undefined) => /'nonce-([^']+)'/.exec(csp ?? "")?.[1];
  const first = await request.get("/privacy");
  const nonce = nonceOf(first.headers()["content-security-policy"]);
  expect(nonce).toBeTruthy();
  expect(nonceOf((await request.get("/privacy")).headers()["content-security-policy"])).not.toBe(nonce);
  const scripts = [...(await first.text()).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  expect(scripts.length).toBeGreaterThan(1);
  // The theme snippet is allowed by its hash instead.
  const unsigned = scripts.filter(([, attrs]) => !attrs.includes(`nonce="${nonce}"`));
  expect(unsigned.map(([, , body]) => body.includes('localStorage.getItem("theme")'))).toEqual([true]);
});

test("the app shell renders under the CSP with no blocked-resource breakage", async ({ signedIn: { page } }) => {
  const violations = cspViolations(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto("/transactions");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(violations, violations.join("\n")).toEqual([]);
});
