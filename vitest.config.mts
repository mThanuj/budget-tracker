import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // "server-only" throws outside React Server Components; tests run in plain Node.
      "server-only": new URL("./tests/stubs/server-only.ts", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/db/**/*.test.ts"],
    setupFiles: ["./tests/stubs/clean-env.ts"],
    // Live output in the terminal, plus a clean copy in test-unit.log.
    reporters: ["default", new URL("./tests/support/vitest-log-reporter.ts", import.meta.url).pathname],
  },
});
