// After `pnpm build`: fails if any secret's actual value appears in the files
// sent to browsers (.next/static). Prints setting names only, never values.
//   node scripts/check-client-bundle.mjs
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";

const envFile = ".env.local";
const env = { ...(existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {}), ...process.env };
// Values that are public by design, or too short/common to mean anything.
const PUBLIC =
  /^(NEXT_PUBLIC_|NODE_|NEXT_TELEMETRY|BILLING_ENABLED$|LLM_\w+_(BASE_URL|MODEL|MODEL_FAST|STRUCTURED|OPTIONS|BODY)$|LLM_CHAIN_|AI_GLOBAL_)/;
const SECRETISH = /(SECRET|KEY|TOKEN|PASSWORD|DATABASE_URL|PASSPHRASE|ADMIN_EMAILS|LEGAL_NAME|SUPPORT_|BUSINESS_)/;
const watched = Object.entries(env).filter(
  ([k, v]) => SECRETISH.test(k) && !PUBLIC.test(k) && typeof v === "string" && v.trim().length >= 8,
);

const files = [];
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
};
if (!existsSync(".next/static")) {
  console.error("No .next/static: run `pnpm build` first.");
  process.exit(2);
}
walk(".next/static");

const leaks = [];
for (const [key, value] of watched) {
  const hits = files.filter((f) => readFileSync(f, "utf8").includes(value.trim()));
  if (hits.length) leaks.push(`${key} (in ${hits.length} file${hits.length === 1 ? "" : "s"})`);
}
console.log(`checked ${watched.length} secret values against ${files.length} client files`);
if (leaks.length) {
  console.error("LEAKED into the browser bundle:", leaks.join(", "));
  process.exit(1);
}
console.log("no secrets in the client bundle");
