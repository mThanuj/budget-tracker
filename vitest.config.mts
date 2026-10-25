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
    // unit: pure logic · db: services on in-memory Postgres (PGlite) ·
    // integration: server actions and route handlers on PGlite ·
    // component: React components in jsdom (set per file with @vitest-environment)
    include: [
      "tests/unit/**/*.test.ts",
      "tests/db/**/*.test.ts",
      "tests/integration/**/*.test.ts",
      "tests/component/**/*.test.tsx",
    ],
    setupFiles: ["./tests/stubs/clean-env.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      // Generated shadcn primitives and type-only files aren't ours to test.
      exclude: ["src/components/ui/**", "src/**/*.d.ts", "src/lib/setup-types.ts"],
      reporter: ["text-summary", "html"],
    },
    // Live output in the terminal, plus a clean copy in test-unit.log.
    reporters: ["default", new URL("./tests/support/vitest-log-reporter.ts", import.meta.url).pathname],
  },
});
