import { and, asc, eq, getTableColumns, isNull, sql } from "drizzle-orm";
import type { ContributionInput, GoalInput } from "@/lib/validation";
import type { Db } from "../db";
import { goal, goalContribution } from "../db/schema";
import { UserError } from "./errors";

export type GoalWithSaved = Awaited<ReturnType<typeof listGoals>>[number];

export async function listGoals(db: Db, userId: string, { includeArchived = false } = {}) {
  return db
    .select({
      ...getTableColumns(goal),
      savedMinor: sql<number>`coalesce((select sum(c.amount_minor) from "goal_contribution" c where c.goal_id = "goal"."id"), 0)`.mapWith(Number),
    })
    .from(goal)
    .where(and(eq(goal.userId, userId), includeArchived ? undefined : isNull(goal.archivedAt)))
    .orderBy(asc(goal.createdAt));
}

export async function getOwnedGoal(db: Db, userId: string, id: string) {
  const [row] = await db.select().from(goal).where(and(eq(goal.id, id), eq(goal.userId, userId)));
  if (!row) throw new UserError("That goal doesn't exist.");
  return row;
}

async function savedFor(db: Db, goalId: string) {
  const [{ saved }] = await db
    .select({ saved: sql<number>`coalesce(sum(${goalContribution.amountMinor}), 0)`.mapWith(Number) })
    .from(goalContribution)
    .where(eq(goalContribution.goalId, goalId));
  return saved;
}

export async function createGoal(db: Db, userId: string, input: GoalInput) {
  const [row] = await db
    .insert(goal)
    .values({ userId, name: input.name, targetMinor: input.target, targetDate: input.targetDate, icon: input.icon, color: input.color })
    .returning();
  return row;
}

export async function updateGoal(db: Db, userId: string, id: string, input: GoalInput) {
  await getOwnedGoal(db, userId, id);
  const [row] = await db
    .update(goal)
    .set({ name: input.name, targetMinor: input.target, targetDate: input.targetDate, icon: input.icon, color: input.color })
    .where(and(eq(goal.id, id), eq(goal.userId, userId)))
    .returning();
  return row;
}

export async function archiveGoal(db: Db, userId: string, id: string) {
  await getOwnedGoal(db, userId, id);
  await db.update(goal).set({ archivedAt: new Date() }).where(eq(goal.id, id));
}

export async function restoreGoal(db: Db, userId: string, id: string) {
  await getOwnedGoal(db, userId, id);
  await db.update(goal).set({ archivedAt: null }).where(eq(goal.id, id));
}

/** Deleting a goal releases everything set aside for it. */
export async function deleteGoal(db: Db, userId: string, id: string) {
  await getOwnedGoal(db, userId, id);
  await db.delete(goal).where(and(eq(goal.id, id), eq(goal.userId, userId)));
}

/** Sets money aside for a goal, or takes some back out (never more than is saved). */
export async function addContribution(db: Db, userId: string, goalId: string, input: ContributionInput) {
  const g = await getOwnedGoal(db, userId, goalId);
  if (g.archivedAt) throw new UserError("Restore this goal before adding to it.");
  const amount = input.direction === "withdraw" ? -input.amount : input.amount;
  if (amount < 0 && -amount > (await savedFor(db, goalId))) {
    throw new UserError("You can't take out more than is saved for this goal.", "amount");
  }
  const [row] = await db
    .insert(goalContribution)
    .values({ userId, goalId, amountMinor: amount, occurredOn: input.occurredOn, note: input.note })
    .returning();
  return row;
}

/** Total set aside across active goals, shown next to wallet balances. */
export async function totalSetAside(db: Db, userId: string) {
  const goals = await listGoals(db, userId);
  return goals.reduce((sum, g) => sum + Math.max(g.savedMinor, 0), 0);
}
