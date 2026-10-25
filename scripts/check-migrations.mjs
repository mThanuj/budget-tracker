// Fails when src/server/db/schema.ts has changes that no migration in drizzle/
// covers (the schema was edited without `pnpm db:generate`). drizzle-kit runs
// against a scratch copy of drizzle/, so this never writes to the repo, and it
// needs no database connection.
//   pnpm db:check
import { execFileSync } from "node:child_process";
import { cpSync, rmSync, writeFileSync } from "node:fs";

// Relative to the repo root: drizzle-kit mishandles absolute output paths.
const scratch = "node_modules/.cache/db-check";
const out = `${scratch}/drizzle`;
const config = `${scratch}/drizzle.config.json`;

rmSync(scratch, { recursive: true, force: true });
cpSync("drizzle", out, { recursive: true });
writeFileSync(
  config,
  JSON.stringify({ dialect: "postgresql", schema: "./src/server/db/schema.ts", out, casing: "snake_case" }),
);

let output;
try {
  // drizzle-kit can exit 0 even when it fails, so its message decides the result.
  output = execFileSync("pnpm", ["exec", "drizzle-kit", "generate", "--config", config], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch (err) {
  output = `${err.stdout ?? ""}${err.stderr ?? ""}`;
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

if (/No schema changes/.test(output)) {
  console.log("migrations match the schema");
} else if (/Your SQL migration file/.test(output)) {
  console.error(
    "src/server/db/schema.ts has changes with no migration. Run `pnpm db:generate` and commit the new file in drizzle/.",
  );
  process.exit(1);
} else {
  console.error(`Couldn't check the migrations; drizzle-kit said:\n${output}`);
  process.exit(2);
}
