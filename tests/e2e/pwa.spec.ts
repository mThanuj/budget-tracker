// The installable app (D-031): what a phone fetches to install it works for
// someone who isn't signed in yet (installing sends no cookies).
import { expect, test } from "./support/fixtures";

test("the app can be installed: its manifest and icons load without signing in", async ({ page, request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);
  const manifest = await res.json();
  expect(manifest).toMatchObject({ display: "standalone", start_url: "/dashboard" });

  for (const icon of [...manifest.icons.map((i: { src: string }) => i.src), "/apple-icon"]) {
    const image = await request.get(icon, { maxRedirects: 0 });
    expect(image.status(), icon).toBe(200);
    expect(image.headers()["content-type"], icon).toBe("image/png");
  }

  // Pages point browsers at it.
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", /manifest\.webmanifest/);
});
