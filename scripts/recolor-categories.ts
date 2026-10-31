// One-time (decision D-028): brings existing accounts' category colors under
// the rule that a category's color looks different from the others of its kind.
// Only colors change, and only of active categories; nothing is deleted or
// renamed. Running it again changes nothing. Prints counts only.
//
//   pnpm categories:recolor --dry-run   # count what would change
//   pnpm categories:recolor             # change it
//
// Uses DATABASE_URL_UNPOOLED or DATABASE_URL: from your shell if set there,
// otherwise from .env.local. Point it at production only on purpose.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/server/db/schema";
import { recolorCategories } from "../src/server/services/categories";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set (in your shell or .env.local).");
    process.exitCode = 1;
    return;
  }

  const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 15_000, keepAlive: true });
  const db = drizzle({ client: pool, schema, casing: "snake_case" });
  try {
    const users = await db.select({ id: schema.user.id }).from(schema.user);
    let accounts = 0;
    let categories = 0;
    // One account at a time, each in its own transaction (recolorCategories).
    for (const { id } of users) {
      const changed = await recolorCategories(db, id, { dryRun });
      if (changed > 0) {
        accounts++;
        categories += changed;
      }
    }
    console.log(
      dryRun
        ? `Dry run: would recolor ${categories} categories in ${accounts} of ${users.length} accounts. Nothing changed.`
        : `Recolored ${categories} categories in ${accounts} of ${users.length} accounts.`,
    );
  } finally {
    await pool.end();
  }
}

void main();
