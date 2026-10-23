// Dev helper: screenshot a page in WebKit at desktop and mobile sizes.
// Usage: node scripts/screenshot.mjs <url> <outPrefix> [dark]
import { webkit } from "@playwright/test";

const [url, out, scheme = "light"] = process.argv.slice(2);
const browser = await webkit.launch();
for (const [name, viewport] of [["desktop", { width: 1280, height: 860 }], ["mobile", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport, colorScheme: scheme, reducedMotion: "reduce" });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${out}-${name}.png`, fullPage: true });
  await page.close();
}
await browser.close();
console.log("saved", out);
