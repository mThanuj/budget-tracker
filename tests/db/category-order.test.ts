import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_CATEGORIES } from "@/lib/default-categories";
import { category } from "@/server/db/schema";
import { seedNewUser } from "@/server/db/seed-defaults";
import { createCategory, listCategories } from "@/server/services/categories";
import { createTestDb, createTestUser, freeCategoryColor } from "./helpers";

const namesOf = async (t: Awaited<ReturnType<typeof createTestDb>>, userId: string, kind: "income" | "expense") =>
  (await listCategories(t.db, userId)).filter((c) => c.kind === kind).map((c) => c.name);

const defaults = (kind: "income" | "expense") => DEFAULT_CATEGORIES.filter((c) => c.kind === kind).map((c) => c.name);

describe("category order", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => {
    t = await createTestDb();
  });
  afterAll(() => t.close());

  it("lists defaults in their intended order and appends new categories", async () => {
    const u = await createTestUser(t.db);
    await seedNewUser(t.db, u.id);
    const pets = await freeCategoryColor(t.db, u.id, "expense");
    await createCategory(t.db, u.id, { name: "Pets", kind: "expense", icon: "paw-print", color: pets });
    const rental = await freeCategoryColor(t.db, u.id, "income");
    await createCategory(t.db, u.id, { name: "Rental income", kind: "income", icon: "house", color: rental });

    expect(await namesOf(t, u.id, "expense")).toEqual([...defaults("expense"), "Pets"]);
    expect(await namesOf(t, u.id, "income")).toEqual([...defaults("income"), "Rental income"]);
  });

  it("the migration backfill restores the same order for existing accounts", async () => {
    const u = await createTestUser(t.db);
    await seedNewUser(t.db, u.id);
    const pets = await freeCategoryColor(t.db, u.id, "expense");
    await createCategory(t.db, u.id, { name: "Pets", kind: "expense", icon: "paw-print", color: pets });
    await t.db.update(category).set({ position: 0 }).where(eq(category.userId, u.id)); // pre-migration state

    const migration = readFileSync("drizzle/0002_category_position.sql", "utf8");
    const backfill = migration.slice(migration.indexOf("UPDATE"));
    await t.db.execute(sql.raw(backfill));

    expect(await namesOf(t, u.id, "expense")).toEqual([...defaults("expense"), "Pets"]);
  });
});
