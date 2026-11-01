// Vercel build: apply database migrations, then build. Production deploys
// migrate production; the `staging` branch's previews migrate the staging
// database (D-037); other previews have no database settings and never
// migrate. A failed migration fails the deploy, so the previous version keeps
// serving.
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/**
 * Which database this build migrates, from Vercel's system variables.
 * @param {Record<string, string | undefined>} env
 * @returns {"production" | "staging" | null}
 */
export function migrationTarget(env) {
  if (env.VERCEL_ENV === "production") return "production";
  if (env.VERCEL_ENV === "preview" && env.VERCEL_GIT_COMMIT_REF === "staging") return "staging";
  return null;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const run = (cmd) => execSync(cmd, { stdio: "inherit" });
  const target = migrationTarget(process.env);
  if (target) {
    console.log(`Migrating the ${target} database.`);
    run("pnpm db:migrate");
  } else {
    console.log(`Skipping migrations for a ${process.env.VERCEL_ENV ?? "local"} build.`);
  }
  run("pnpm build");
}
