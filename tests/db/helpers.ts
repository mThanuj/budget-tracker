import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/server/db/schema";

/** A fresh in-memory Postgres with all migrations applied. */
export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle({ client, schema, casing: "snake_case" });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return { db, close: () => client.close() };
}

export async function createTestUser(
  db: Awaited<ReturnType<typeof createTestDb>>["db"],
  overrides: Partial<typeof schema.user.$inferInsert> = {},
) {
  const id = overrides.id ?? crypto.randomUUID();
  const [row] = await db
    .insert(schema.user)
    .values({ id, name: "Test User", email: `${id}@example.com`, ...overrides })
    .returning();
  return row;
}
