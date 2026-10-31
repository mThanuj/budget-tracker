import { and, asc, eq, getTableColumns, isNull, ne, sql } from "drizzle-orm";
import { checkCategoryColor, type ColoredCategory, nearestAllowedColor } from "@/lib/category-colors";
import { DEFAULT_CATEGORIES, PREVIOUS_DEFAULT_COLORS } from "@/lib/default-categories";
import type { CategoryInput } from "@/lib/validation";
import type { Db } from "../db";
import { category, transaction } from "../db/schema";
import { rethrowUnique, UserError } from "./errors";
import { assertRoomFor } from "./limits";

export async function listCategories(db: Db, userId: string, { includeArchived = false } = {}) {
  return db
    .select({
      ...getTableColumns(category),
      // Qualified on purpose: an unqualified "id" would resolve to t.id. The user
      // filter lets Postgres use the indexes, which all start with user_id.
      usage:
        sql<number>`(select count(*) from "transaction" t where t.user_id = "category"."user_id" and t.category_id = "category"."id")`.mapWith(
          Number,
        ),
    })
    .from(category)
    .where(and(eq(category.userId, userId), includeArchived ? undefined : isNull(category.archivedAt)))
    .orderBy(asc(category.kind), asc(category.position), asc(category.createdAt));
}

export async function getOwnedCategory(db: Db, userId: string, categoryId: string) {
  const [row] = await db
    .select()
    .from(category)
    .where(and(eq(category.id, categoryId), eq(category.userId, userId)));
  if (!row) throw new UserError("That category doesn't exist.", "categoryId");
  return row;
}

/** A second category with the same name is a message on the form, not a crash. */
const rethrowDuplicate = rethrowUnique(
  "category_user_kind_name_key",
  "You already have a category with that name.",
  "name",
);

/**
 * Refuses a color that looks like one of the user's other active categories of
 * the same kind, or that isn't a category color at all (D-028).
 */
/** The names and colors of the user's active categories of a kind, except one. */
function activeColors(db: Db, userId: string, kind: CategoryInput["kind"], except?: string) {
  return db
    .select({ name: category.name, color: category.color })
    .from(category)
    .where(
      and(
        eq(category.userId, userId),
        eq(category.kind, kind),
        isNull(category.archivedAt),
        except ? ne(category.id, except) : undefined,
      ),
    );
}

async function assertDistinctColor(
  db: Db,
  userId: string,
  kind: CategoryInput["kind"],
  color: string,
  except?: string,
) {
  const others = await activeColors(db, userId, kind, except);
  const check = checkCategoryColor(color.toLowerCase(), others);
  if (check.ok) return;
  throw new UserError(
    check.reason === "too_close"
      ? `That color looks too much like ${check.to.name}. Pick another.`
      : "Pick one of the colors shown.",
    "color",
  );
}

export async function createCategory(db: Db, userId: string, input: CategoryInput) {
  await assertRoomFor(db, userId, "categories");
  await assertDistinctColor(db, userId, input.kind, input.color);
  const [row] = await db
    .insert(category)
    .values({
      ...input,
      userId,
      // New categories go after the existing ones of the same kind.
      position: sql`(select coalesce(max(${category.position}), -1) + 1 from ${category} where ${category.userId} = ${userId} and ${category.kind} = ${input.kind})`,
    })
    .returning()
    .catch(rethrowDuplicate);
  return row;
}

/** Kind (income/expense) is fixed after creation so past entries stay consistent. */
export async function updateCategory(db: Db, userId: string, categoryId: string, input: Omit<CategoryInput, "kind">) {
  const existing = await getOwnedCategory(db, userId, categoryId);
  // Keeping its color is always fine: older categories may share one (D-028).
  if (input.color.toLowerCase() !== existing.color.toLowerCase()) {
    await assertDistinctColor(db, userId, existing.kind, input.color, categoryId);
  }
  const [row] = await db
    .update(category)
    .set({ name: input.name, icon: input.icon, color: input.color })
    .where(and(eq(category.id, categoryId), eq(category.userId, userId)))
    .returning()
    .catch(rethrowDuplicate);
  return row;
}

export async function archiveCategory(db: Db, userId: string, categoryId: string) {
  await getOwnedCategory(db, userId, categoryId);
  await db
    .update(category)
    .set({ archivedAt: new Date() })
    .where(and(eq(category.id, categoryId), eq(category.userId, userId)));
}

/** Restores an archived category; if its color now looks like an active one's, it gets the nearest allowed (D-028). */
export async function restoreCategory(db: Db, userId: string, categoryId: string) {
  const existing = await getOwnedCategory(db, userId, categoryId);
  const others = await activeColors(db, userId, existing.kind, categoryId);
  const color = checkCategoryColor(existing.color.toLowerCase(), others).ok
    ? existing.color
    : nearestAllowedColor(
        existing.color,
        others.map((o) => o.color),
      );
  await db
    .update(category)
    .set({ archivedAt: null, color })
    .where(and(eq(category.id, categoryId), eq(category.userId, userId)));
}

/**
 * Brings an existing account's categories under the color rule (D-028), once:
 * defaults its owner never recolored get the new default colors; then, per
 * kind in list order, a category keeps its color if it passes against the ones
 * before it, or gets the allowed color nearest to it. Only colors change, and
 * only of active categories (restoring checks archived ones). Returns how many
 * change; with `dryRun`, nothing is written. Running it again changes nothing.
 */
export async function recolorCategories(db: Db, userId: string, { dryRun = false } = {}) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: category.id,
        kind: category.kind,
        name: category.name,
        color: category.color,
        isDefault: category.isDefault,
      })
      .from(category)
      .where(and(eq(category.userId, userId), isNull(category.archivedAt)))
      .orderBy(asc(category.kind), asc(category.position), asc(category.createdAt));
    let changed = 0;
    for (const kind of ["expense", "income"] as const) {
      const kept: ColoredCategory[] = [];
      for (const row of rows.filter((r) => r.kind === kind)) {
        let color = row.color.toLowerCase();
        const fresh = DEFAULT_CATEGORIES.find((d) => d.kind === kind && d.name === row.name);
        if (row.isDefault && fresh && PREVIOUS_DEFAULT_COLORS[`${kind}:${row.name}`] === color) color = fresh.color;
        if (!checkCategoryColor(color, kept).ok) {
          color = nearestAllowedColor(
            color,
            kept.map((k) => k.color),
          );
        }
        if (color !== row.color) {
          changed++;
          if (!dryRun) {
            await tx
              .update(category)
              .set({ color })
              .where(and(eq(category.id, row.id), eq(category.userId, userId)));
          }
        }
        kept.push({ name: row.name, color });
      }
    }
    return changed;
  });
}

/** Only unused categories can be deleted; used ones are archived instead. */
export async function deleteCategory(db: Db, userId: string, categoryId: string) {
  await getOwnedCategory(db, userId, categoryId);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(transaction)
    .where(and(eq(transaction.userId, userId), eq(transaction.categoryId, categoryId)));
  if (count > 0) throw new UserError("This category has entries, so it can only be archived.");
  await db.delete(category).where(and(eq(category.id, categoryId), eq(category.userId, userId)));
}
