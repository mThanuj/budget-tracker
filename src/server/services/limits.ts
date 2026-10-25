import { and, eq, gte, ne, sql } from "drizzle-orm";
import { LIMITS } from "@/config/limits";
import type { Db } from "../db";
import { alertDismissal, category, goal, goalContribution, recurringRule, transaction, wallet } from "../db/schema";
import { UserError } from "./errors";

// Checked before each insert. Two requests at the same moment can both pass
// the count, so a limit can be overshot by a few; that's fine for its purpose
// (stopping runaway scripts, see src/config/limits.ts).

const lastDay = sql`now() - interval '24 hours'`;
const n = (value: number) => value.toLocaleString("en-US");

const TOTALS = {
  wallets: { table: wallet, userId: wallet.userId, what: "wallets" },
  categories: { table: category, userId: category.userId, what: "categories" },
  goals: { table: goal, userId: goal.userId, what: "goals" },
  recurringItems: { table: recurringRule, userId: recurringRule.userId, what: "recurring items" },
} as const;

/** Throws a UserError if adding `adding` more would go over the account's limit. */
export async function assertRoomFor(db: Db, userId: string, kind: keyof typeof TOTALS, adding = 1) {
  const { table, userId: owner, what } = TOTALS[kind];
  if ((await db.$count(table, eq(owner, userId))) + adding > LIMITS[kind]) {
    throw new UserError(
      `You can have up to ${n(LIMITS[kind])} ${what}, and archived ones count too. Delete some you no longer need first.`,
    );
  }
}

const DAILY = {
  entriesPerDay: {
    count: (db: Db, userId: string) =>
      db.$count(
        transaction,
        and(eq(transaction.userId, userId), gte(transaction.createdAt, lastDay), ne(transaction.source, "recurring")),
      ),
    what: "entries",
  },
  goalContributionsPerDay: {
    count: (db: Db, userId: string) =>
      db.$count(goalContribution, and(eq(goalContribution.userId, userId), gte(goalContribution.createdAt, lastDay))),
    what: "goal savings and withdrawals",
  },
  alertDismissalsPerDay: {
    count: (db: Db, userId: string) =>
      db.$count(alertDismissal, and(eq(alertDismissal.userId, userId), gte(alertDismissal.dismissedAt, lastDay))),
    what: "dismissed alerts",
  },
} as const;

/** Throws a UserError once the account has added its daily limit of something. */
export async function assertDailyRoomFor(db: Db, userId: string, kind: keyof typeof DAILY) {
  if ((await DAILY[kind].count(db, userId)) >= LIMITS[kind]) {
    throw new UserError(
      `That's ${n(LIMITS[kind])} ${DAILY[kind].what} in the last 24 hours, the most allowed in a day. Try again tomorrow.`,
    );
  }
}
