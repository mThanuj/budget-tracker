// What a site showing a shared link, and a search engine, get (D-036). None of
// it needs a sign-in: crawlers send no cookies.
import { expect, test } from "./support/fixtures";

const prod = process.env.PW_PROD === "1";
const site = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").origin;
const paymentsOn = process.env.BILLING_ENABLED?.trim() === "true";
const meta = (html: string, key: string) =>
  new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`).exec(html)?.[1];

test("a shared link gets a preview card: title, description and image", async ({ request }) => {
  // Link-preview crawlers get the tags in <head> (Next streams them later for browsers).
  const res = await request.get("/", { headers: { "user-agent": "facebookexternalhit/1.1" } });
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(meta(html, "og:site_name")).toBe("ClearPaisa");
  expect(meta(html, "og:title")).toBe("ClearPaisa");
  expect(meta(html, "og:description")).toMatch(/^Track your spending/);
  expect(meta(html, "twitter:card")).toBe("summary_large_image");
  expect(html).toMatch(/<link rel="canonical" href="[^"]*\/"/);

  const image = new URL(meta(html, "og:image") ?? "", site);
  if (prod) expect(image.origin).toBe(site); // full address from BETTER_AUTH_URL (dev always says localhost)
  expect(image.pathname).toBe("/opengraph-image");
  const png = await request.get(image.pathname + image.search, { maxRedirects: 0 });
  expect(png.status()).toBe(200);
  expect(png.headers()["content-type"]).toBe("image/png");
});

test("search engines may read the public pages, not the API, and find them in the sitemap", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Allow: /");
  expect(robots).toContain("Disallow: /api/");
  expect(robots).toContain(`Sitemap: ${site}/sitemap.xml`);

  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const path of ["/", "/privacy", "/terms", "/contact"]) expect(sitemap).toContain(`<loc>${site}${path}</loc>`);
  expect(sitemap.includes(`<loc>${site}/refund</loc>`)).toBe(paymentsOn);
  expect(sitemap).not.toContain("/dashboard");
});

test("the three fonts are preloaded from the site itself", async ({ page }) => {
  test.skip(!prod, "file names and preloading differ in development");
  await page.goto("/");
  const fonts = page.locator('link[rel="preload"][as="font"]');
  await expect(fonts).toHaveCount(3);
  for (const href of await fonts.evaluateAll((links) => links.map((l) => l.getAttribute("href")))) {
    expect(href).toMatch(/^\/_next\/static\/media\/.+\.woff2$/);
  }
});
