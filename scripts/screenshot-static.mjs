// Dev helper for sandboxes that can't run a server: renders a prerendered page
// from the production build by serving .next files through request interception.
// Usage: node scripts/screenshot-static.mjs <page.html> <outPrefix> [light|dark]
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { webkit } from "@playwright/test";

const [htmlFile, out, scheme = "light"] = process.argv.slice(2);
const TYPES = { ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".woff": "font/woff", ".ico": "image/x-icon", ".svg": "image/svg+xml" };

const browser = await webkit.launch();
for (const [name, viewport] of [["desktop", { width: 1280, height: 860 }], ["mobile", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport, colorScheme: scheme, reducedMotion: "reduce" });
  await page.route("http://local.test/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    try {
      if (pathname.startsWith("/_next/static/")) {
        const file = join(".next/static", decodeURIComponent(pathname.slice("/_next/static/".length)));
        return route.fulfill({ body: await readFile(file), contentType: TYPES[extname(file)] ?? "application/octet-stream" });
      }
      if (pathname === "/") {
        return route.fulfill({ body: await readFile(join(".next/server/app", htmlFile)), contentType: "text/html" });
      }
    } catch {}
    return route.fulfill({ status: 404, body: "" });
  });
  await page.goto("http://local.test/", { waitUntil: "networkidle" });
  await page.screenshot({ path: `${out}-${name}.png`, fullPage: true });
  await page.close();
}
await browser.close();
console.log("saved", out);
