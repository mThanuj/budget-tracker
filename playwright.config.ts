import { defineConfig, devices } from "@playwright/test";

function workersFromEnv(value: string | undefined): number | string | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  if (/^\d+%$/.test(v)) return v;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

// Runs against the dev server on :3000 (reused if already running). The tests
// sign in with Better Auth's testUtils, so they need .env.local (database + secret).
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // 75% of CPU cores (6 on an 8-core Mac). All workers share one dev server and
  // the AI rate limits, so going higher mostly adds contention. Override with
  // PW_WORKERS=8 (or "50%"), or pass --workers=N.
  workers: process.env.CI ? 2 : workersFromEnv(process.env.PW_WORKERS) ?? "75%",
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"]],
  timeout: 45_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 15"] } },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
