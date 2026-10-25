import { and, asc, eq, getTableColumns, isNull, sql } from "drizzle-orm";
import type { CategoryInput } from "@/lib/validation";
import type { Db } from "../db";
import { category, transaction } from "../db/schema";
import { UserError } from "./errors";


export async function listCategories(db: Db, userId: string, { includeArchived = false } = {}) {
  return db
    .select({
      ...getTableColumns(category),
      // Qualified on purpose: an unqualified "id" would resolve to t.id.
      usage: sql<number>`(select count(*) from "transaction" t where t.category_id = "category"."id")`.mapWith(Number),
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

function rethrowDuplicate(err: unknown): never {
  if (err instanceof Error && /category_user_kind_name_key/.test(`${err.message} ${(err as { cause?: Error }).cause?.message ?? ""}`)) {
    throw new UserError("You already have a category with that name.", "name");
  }
  throw err;
}

export async function createCategory(db: Db, userId: string, input: CategoryInput) {
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
export async function updateCategory(
  db: Db,
  userId: string,
  categoryId: string,
  input: Omit<CategoryInput, "kind">,
) {
  await getOwnedCategory(db, userId, categoryId);
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
  await db.update(category).set({ archivedAt: new Date() }).where(eq(category.id, categoryId));
}

export async function restoreCategory(db: Db, userId: string, categoryId: string) {
  await getOwnedCategory(db, userId, categoryId);
  await db.update(category).set({ archivedAt: null }).where(eq(category.id, categoryId));
}

/** Only unused categories can be deleted; used ones are archived instead. */
export async function deleteCategory(db: Db, userId: string, categoryId: string) {
  await getOwnedCategory(db, userId, categoryId);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(transaction)
    .where(eq(transaction.categoryId, categoryId));
  if (count > 0) throw new UserError("This category has entries, so it can only be archived.");
  await db.delete(category).where(and(eq(category.id, categoryId), eq(category.userId, userId)));
}
