import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";
import { headerRules } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (Hetzner + Coolify).
  // Vercel builds its own way, so not there.
  ...(!process.env.VERCEL && { output: "standalone" as const }),
  // Keep the dev-tools badge off the sidebar's account menu.
  devIndicators: { position: "bottom-right" },
  cacheComponents: true,
  partialPrefetching: true,
  // Sandboxed environments (e.g. the coding agent's) can't open local sockets,
  // which Turbopack's default loader pool needs. Opt in with NEXT_WORKER_THREADS=1.
  ...(process.env.NEXT_WORKER_THREADS === "1" && {
    experimental: { turbopackPluginRuntimeStrategy: "forceWorkerThreads" },
  }),
  // Security headers on every response (HSTS, clickjacking, nosniff). Pages get
  // their CSP, with a fresh nonce, from src/proxy.ts; everything the proxy doesn't
  // see (route handlers, files, dotted 404s) a fixed one (D-029).
  async headers() {
    return headerRules({ dev: process.env.NODE_ENV !== "production" });
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// Error monitoring (docs/OBSERVABILITY.md) only when a DSN is set at build time;
// without one the config is exactly as above. With one, source maps upload to
// Sentry when SENTRY_AUTH_TOKEN is set and are then deleted from the build
// output, so they're never served publicly.
export default process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      telemetry: false, // the build plugin otherwise reports its own usage to Sentry
      sourcemaps: { deleteSourcemapsAfterUpload: true },
      bundleSizeOptimizations: {
        excludeDebugStatements: true,
        excludeReplayIframe: true,
        excludeReplayShadowDom: true, // replay is error-only and never records iframes or shadow DOM
        // The replay worker (compression) stays.
      },
    })
  : nextConfig;
