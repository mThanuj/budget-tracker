import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/**
 * Applies pending migrations from ./drizzle. Runs once when the production
 * server starts (see instrumentation.ts); a failure stops the new version from
 * starting, so the old one keeps serving.
 */
export async function runMigrations() {
  // Neon needs a direct (unpooled) connection for migrations.
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const started = Date.now();
    await migrate(drizzle({ client: pool }), { migrationsFolder: path.join(process.cwd(), "drizzle") });
    console.log(`[db] migrations up to date (${Date.now() - started} ms)`);
  } finally {
    await pool.end();
  }
}
