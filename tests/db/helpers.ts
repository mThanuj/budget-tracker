import { PGlite } from "@electric-sql/pglite";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { suggestCategoryColors } from "@/lib/category-colors";
import type { Db } from "@/server/db";
import * as schema from "@/server/db/schema";

/** A fresh in-memory Postgres with all migrations applied. */
export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle({ client, schema, casing: "snake_case" });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return { db, close: () => client.close() };
}

export async function createTestUser(db: Db, overrides: Partial<typeof schema.user.$inferInsert> = {}) {
  const id = overrides.id ?? crypto.randomUUID();
  const [row] = await db
    .insert(schema.user)
    .values({ id, name: "Test User", email: `${id}@example.com`, ...overrides })
    .returning();
  return row;
}

/** A color a new category of this kind may have (D-028): the first suggestion against the user's others. */
export async function freeCategoryColor(db: Db, userId: string, kind: "income" | "expense") {
  const rows = await db
    .select({ color: schema.category.color })
    .from(schema.category)
    .where(and(eq(schema.category.userId, userId), eq(schema.category.kind, kind), isNull(schema.category.archivedAt)));
  const [color] = suggestCategoryColors(
    rows.map((r) => r.color),
    1,
    () => 0,
  );
  return color;
}
