// Vercel build: apply database migrations for production deploys only (never
// for preview builds), then build. A failed migration fails the deploy, so
// the previous version keeps serving.
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });

if (process.env.VERCEL_ENV === "production") {
  run("pnpm db:migrate");
} else {
  console.log(`Skipping migrations for a ${process.env.VERCEL_ENV ?? "local"} build.`);
}
run("pnpm build");
