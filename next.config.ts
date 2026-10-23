import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (Hetzner + Coolify).
  output: "standalone",
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
