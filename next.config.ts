import type { NextConfig } from "next";

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
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
