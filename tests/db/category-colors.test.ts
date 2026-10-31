// Category colors must look different from the user's other active categories
// of the same kind (D-028); the server enforces it, whatever the form sends.
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkCategoryColor, colorDistance, isCategoryColor } from "@/lib/category-colors";
import { DEFAULT_CATEGORIES, PREVIOUS_DEFAULT_COLORS } from "@/lib/default-categories";
import * as schema from "@/server/db/schema";
import { seedNewUser } from "@/server/db/seed-defaults";
import {
  archiveCategory,
  createCategory,
  listCategories,
  recolorCategories,
  restoreCategory,
  updateCategory,
} from "@/server/services/categories";
import { UserError } from "@/server/services/errors";
import { createTestDb, createTestUser, freeCategoryColor } from "./helpers";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

async function newUser() {
  const u = await createTestUser(t.db);
  await seedNewUser(t.db, u.id);
  const groceries = (await listCategories(t.db, u.id)).find((c) => c.name === "Groceries")!;
  return { id: u.id, groceries };
}
const refusal = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (err: unknown) => (err instanceof UserError ? { message: err.message, field: err.field } : err),
  );
const expense = (name: string, color: string) => ({ name, kind: "expense" as const, icon: "tag" as const, color });

describe("category colors", () => {
  it("refuses a color that looks like another category's, even with a different hex code, and saves nothing", async () => {
    const u = await newUser();
    const lookalike = "#3a9f79"; // a different hex, but it looks just like Groceries' color
    expect(colorDistance(lookalike, u.groceries.color)).toBeLessThan(2);
    expect(await refusal(createCategory(t.db, u.id, expense("Pets", lookalike)))).toEqual({
      message: "That color looks too much like Groceries. Pick another.",
      field: "color",
    });
    expect((await listCategories(t.db, u.id)).some((c) => c.name === "Pets")).toBe(false);
  });

  it("accepts a color that looks different, and refuses ones categories can't have", async () => {
    const u = await newUser();
    const free = await freeCategoryColor(t.db, u.id, "expense");
    await expect(createCategory(t.db, u.id, expense("Pets", free))).resolves.toMatchObject({ color: free });
    expect(await refusal(createCategory(t.db, u.id, expense("Plants", "#808080")))).toEqual({
      message: "Pick one of the colors shown.",
      field: "color",
    });
  });

  it("compares within a kind: an income category may share a spending category's color", async () => {
    const u = await newUser();
    const subscriptions = (await listCategories(t.db, u.id)).find((c) => c.name === "Subscriptions")!;
    // Subscriptions' color is clearly different from every income category's (ΔE 11.9 from the nearest).
    const income = {
      name: "Rental income",
      kind: "income" as const,
      icon: "house" as const,
      color: subscriptions.color,
    };
    await expect(createCategory(t.db, u.id, income)).resolves.toMatchObject({ color: subscriptions.color });
    expect(await refusal(createCategory(t.db, u.id, expense("Streaming", subscriptions.color)))).toMatchObject({
      message: "That color looks too much like Subscriptions. Pick another.",
    });
  });

  it("ignores archived categories; a restored one gets the nearest allowed color if its own now clashes", async () => {
    const u = await newUser();
    await archiveCategory(t.db, u.id, u.groceries.id);
    const lookalike = "#3a9f79";
    const pets = await createCategory(t.db, u.id, expense("Pets", lookalike));
    expect(pets.color).toBe(lookalike);
    await restoreCategory(t.db, u.id, u.groceries.id);
    const [groceries] = await t.db.select().from(schema.category).where(eq(schema.category.id, u.groceries.id));
    expect(groceries.archivedAt).toBeNull();
    expect(groceries.color).not.toBe(u.groceries.color);
    const others = (await listCategories(t.db, u.id)).filter((c) => c.kind === "expense" && c.id !== groceries.id);
    expect(checkCategoryColor(groceries.color, others)).toEqual({ ok: true });

    // One whose color still fits keeps it.
    const health = (await listCategories(t.db, u.id)).find((c) => c.name === "Health")!;
    await archiveCategory(t.db, u.id, health.id);
    await restoreCategory(t.db, u.id, health.id);
    expect((await listCategories(t.db, u.id)).find((c) => c.id === health.id)?.color).toBe(health.color);
  });

  it("lets an edit keep a color older categories share, but not change to a look-alike", async () => {
    const u = await newUser();
    // Accounts from before this rule can have two categories with one color.
    await t.db
      .update(schema.category)
      .set({ color: u.groceries.color })
      .where(and(eq(schema.category.userId, u.id), eq(schema.category.name, "Dining Out")));
    const dining = (await listCategories(t.db, u.id)).find((c) => c.name === "Dining Out")!;
    await expect(
      updateCategory(t.db, u.id, dining.id, { name: "Eating out", icon: "tag", color: dining.color }),
    ).resolves.toMatchObject({ name: "Eating out", color: u.groceries.color });

    const health = (await listCategories(t.db, u.id)).find((c) => c.name === "Health")!;
    expect(
      await refusal(updateCategory(t.db, u.id, health.id, { name: "Health", icon: "tag", color: "#3a9f79" })),
    ).toMatchObject({ field: "color", message: expect.stringMatching(/too much like (Groceries|Eating out)/) });
    // A category isn't compared with itself.
    const free = await freeCategoryColor(t.db, u.id, "expense");
    await updateCategory(t.db, u.id, health.id, { name: "Health", icon: "tag", color: free });
    await expect(
      updateCategory(t.db, u.id, health.id, { name: "Health", icon: "tag", color: free }),
    ).resolves.toMatchObject({ color: free });
  });

  it("keeps every existing category and its color, and counts the ones users made themselves", async () => {
    const u = await newUser();
    // An account from before this change: an old default color, and a category the user made.
    await t.db
      .update(schema.category)
      .set({ color: "#3f9b74" })
      .where(and(eq(schema.category.userId, u.id), eq(schema.category.name, "Groceries")));
    const petsColor = await freeCategoryColor(t.db, u.id, "expense");
    await t.db.insert(schema.category).values({ userId: u.id, ...expense("Pets", petsColor), position: 99 });
    const before = await listCategories(t.db, u.id, { includeArchived: true });

    // Seeding runs again for existing accounts (e.g. finishing the welcome screen): nothing is deleted or recolored.
    await seedNewUser(t.db, u.id);
    expect(await listCategories(t.db, u.id, { includeArchived: true })).toEqual(before);

    // The user's own category counts like any other: a look-alike is refused, and suggestions avoid it.
    const lookalike = `#${(parseInt(petsColor.slice(1), 16) ^ 0x000001).toString(16).padStart(6, "0")}`;
    expect(await refusal(createCategory(t.db, u.id, expense("Plants", lookalike)))).toMatchObject({
      message: "That color looks too much like Pets. Pick another.",
    });
    const next = await freeCategoryColor(t.db, u.id, "expense");
    expect(colorDistance(next, petsColor)).toBeGreaterThan(5);
  });
});

describe("recoloring an existing account (recolorCategories)", () => {
  /** An account from before D-028: old default colors, its own categories, an archived one. */
  async function oldAccount() {
    const u = await newUser();
    const set = (name: string, color: string) =>
      t.db
        .update(schema.category)
        .set({ color })
        .where(and(eq(schema.category.userId, u.id), eq(schema.category.name, name)));
    for (const [key, color] of Object.entries(PREVIOUS_DEFAULT_COLORS))
      await set(key.slice(key.indexOf(":") + 1), color);
    await set("Health", "#b8923a"); // a default its owner recolored (to the old amber, Fuel's color then)
    const own = (name: string, color: string, position: number) =>
      t.db.insert(schema.category).values({ userId: u.id, ...expense(name, color), position });
    await own("Pets", "#4a7fc1", 100); // the old blue, shared with Bills & Utilities then
    await own("Coffee", "#8a7f72", 101); // the old stone, which reads gray
    const travel = (await listCategories(t.db, u.id)).find((c) => c.name === "Travel")!;
    await archiveCategory(t.db, u.id, travel.id);
    return u;
  }
  const snapshot = async (userId: string) =>
    (await listCategories(t.db, userId, { includeArchived: true })).map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      color: c.color,
      archived: c.archivedAt !== null,
    }));
  const withoutColors = (rows: Awaited<ReturnType<typeof snapshot>>) => rows.map((r) => ({ ...r, color: "" }));

  it("in a dry run, only counts", async () => {
    const u = await oldAccount();
    const before = await snapshot(u.id);
    expect(await recolorCategories(t.db, u.id, { dryRun: true })).toBeGreaterThan(0);
    expect(await snapshot(u.id)).toEqual(before);
  });

  it("deletes and renames nothing, gives untouched defaults the new colors, and brings every color under the rule", async () => {
    const u = await oldAccount();
    const before = await snapshot(u.id);
    const counted = await recolorCategories(t.db, u.id, { dryRun: true });
    expect(await recolorCategories(t.db, u.id)).toBe(counted);
    const after = await snapshot(u.id);

    // Same categories, names, kinds and archived state; only colors may differ.
    expect(withoutColors(after)).toEqual(withoutColors(before));
    const byName = (name: string) => after.find((c) => c.name === name)!;
    expect(byName("Groceries").color).toBe(DEFAULT_CATEGORIES.find((d) => d.name === "Groceries")!.color);
    expect(byName("Travel")).toEqual(before.find((c) => c.name === "Travel")); // archived: left as it was

    for (const kind of ["expense", "income"] as const) {
      const active = after.filter((c) => c.kind === kind && !c.archived);
      active.forEach((c, i) => {
        expect(isCategoryColor(c.color), c.name).toBe(true);
        expect(checkCategoryColor(c.color, active.slice(0, i)), c.name).toEqual({ ok: true });
      });
    }
    // A recolored category stays as near its old look as the rule allows.
    expect(colorDistance(byName("Pets").color, "#4a7fc1")).toBeLessThan(20);
    expect(byName("Coffee").color).not.toBe("#8a7f72");

    expect(await recolorCategories(t.db, u.id)).toBe(0); // running it again changes nothing
  });

  it("leaves an account that already follows the rule alone", async () => {
    const u = await newUser();
    expect(await recolorCategories(t.db, u.id)).toBe(0);
  });
});
