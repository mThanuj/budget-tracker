import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_CATEGORIES } from "@/lib/default-categories";
import { category } from "@/server/db/schema";
import { seedDefaultCategories } from "@/server/db/seed-defaults";
import { createTestDb, createTestUser } from "./helpers";

describe("seedDefaultCategories", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => {
    t = await createTestDb();
  });
  afterAll(() => t.close());

  it("creates the default categories once, even if called repeatedly", async () => {
    const u = await createTestUser(t.db);
    await seedDefaultCategories(t.db, u.id);
    await seedDefaultCategories(t.db, u.id);

    const rows = await t.db.select().from(category).where(eq(category.userId, u.id));
    expect(rows).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(rows.filter((r) => r.kind === "income").length).toBeGreaterThan(0);
    expect(rows.every((r) => r.isDefault)).toBe(true);
  });

  it("keeps each user's categories separate", async () => {
    const a = await createTestUser(t.db);
    const b = await createTestUser(t.db);
    await seedDefaultCategories(t.db, a.id);

    const bRows = await t.db.select().from(category).where(eq(category.userId, b.id));
    expect(bRows).toHaveLength(0);
  });

  it("treats category names case-insensitively per kind", async () => {
    const u = await createTestUser(t.db);
    await seedDefaultCategories(t.db, u.id);
    await expect(
      t.db.insert(category).values({
        userId: u.id,
        name: "groceries",
        kind: "expense",
        color: "#000000",
        icon: "tag",
      }),
    ).rejects.toThrow();
  });

  it("sets profile defaults on new users", async () => {
    const u = await createTestUser(t.db);
    expect(u.currency).toBe("INR");
    expect(u.timezone).toBe("Asia/Kolkata");
    expect(u.aiEnabled).toBe(true);
    expect(u.onboardedAt).toBeNull();
  });
});
