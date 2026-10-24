import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  // Bearer token for /api/cron/* (set on the server; optional in development).
  CRON_SECRET: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(24).optional()),
});

export type Env = z.infer<typeof schema>;

// `next build` (e.g. the Docker image) must not need real secrets. Modules are
// re-evaluated when the server starts, so these never serve a request.
const BUILD_PLACEHOLDERS: Env = {
  DATABASE_URL: "postgresql://build:build@localhost:5432/build",
  BETTER_AUTH_SECRET: "build-time-placeholder-never-used-at-runtime",
  BETTER_AUTH_URL: "http://localhost:3000",
  GOOGLE_CLIENT_ID: "build-placeholder",
  GOOGLE_CLIENT_SECRET: "build-placeholder",
};

let cached: Env | undefined;

/** Validated on first use. At runtime a missing value fails loudly. */
export function env(): Env {
  if (cached) return cached;
  if (process.env.NEXT_PHASE === "phase-production-build") return BUILD_PLACEHOLDERS;

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment variables (see .env.example):\n${z.prettifyError(parsed.error)}`,
    );
  }
  cached = parsed.data;
  return cached;
}
