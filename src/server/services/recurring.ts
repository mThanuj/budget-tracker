import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { addDays, type ISODate, todayInTz } from "@/lib/dates";
import { normalizeMerchant } from "@/lib/merchant";
import { occurrenceOnOrAfter, occurrencesBetween, type Schedule } from "@/lib/recurring";
import { detectSubscriptions } from "@/lib/subscriptions";
import type { RecurringInput } from "@/lib/validation";
import type { Db } from "../db";
import { alertDismissal, category, recurringRule, transaction, user, wallet } from "../db/schema";
import { UserError } from "./errors";
import { assertRoomFor } from "./limits";
import { assertEntryReferences } from "./transactions";

type Rule = typeof recurringRule.$inferSelect;

const scheduleOf = (r: Pick<Rule, "frequency" | "interval" | "anchorDate" | "endDate">): Schedule => ({
  frequency: r.frequency,
  interval: r.interval,
  anchorDate: r.anchorDate,
  endDate: r.endDate,
});

/** First date to record: never in the past, so creating a rule doesn't back-fill. */
const firstDue = (s: Schedule, today: ISODate) => occurrenceOnOrAfter(s, s.anchorDate > today ? s.anchorDate : today);

export async function getOwnedRule(db: Db, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(recurringRule)
    .where(and(eq(recurringRule.id, id), eq(recurringRule.userId, userId)));
  if (!row) throw new UserError("That recurring item doesn't exist.");
  return row;
}

export type RuleRow = Awaited<ReturnType<typeof listRules>>[number];

/** Rules with display names and the two most recent amounts recorded (for price changes). */
export async function listRules(db: Db, userId: string) {
  const toWallet = sql<string | null>`(select w.name from "wallet" w where w.id = "recurring_rule"."to_wallet_id")`;
  const recent = (offset: number, column: "amount_minor" | "id" | "occurred_on") =>
    sql`(select t.${sql.raw(column)} from "transaction" t where t.recurring_rule_id = "recurring_rule"."id"
         order by t.occurred_on desc, t.created_at desc limit 1 offset ${sql.raw(String(offset))})`;
  return db
    .select({
      rule: recurringRule,
      walletName: wallet.name,
      toWalletName: toWallet,
      categoryName: category.name,
      categoryIcon: category.icon,
      categoryColor: category.color,
      latestAmountMinor: recent(0, "amount_minor").mapWith(Number),
      latestTransactionId: recent(0, "id").mapWith(String),
      latestOn: recent(0, "occurred_on").mapWith(String),
      previousAmountMinor: recent(1, "amount_minor").mapWith(Number),
    })
    .from(recurringRule)
    .innerJoin(wallet, eq(wallet.id, recurringRule.walletId))
    .leftJoin(category, eq(category.id, recurringRule.categoryId))
    .where(eq(recurringRule.userId, userId))
    .orderBy(asc(recurringRule.nextDueOn), asc(recurringRule.createdAt));
}

function ruleValues(input: RecurringInput) {
  return {
    type: input.type,
    amountMinor: input.amount,
    description: input.description,
    categoryId: input.categoryId,
    walletId: input.walletId,
    toWalletId: input.toWalletId,
    frequency: input.frequency,
    interval: input.interval,
    anchorDate: input.anchorDate,
    endDate: input.endDate,
    mode: input.mode,
    isSubscription: input.isSubscription,
  };
}

export async function createRule(db: Db, userId: string, input: RecurringInput, today: ISODate) {
  await assertEntryReferences(db, userId, input);
  await assertRoomFor(db, userId, "recurringItems");
  const [row] = await db
    .insert(recurringRule)
    .values({ ...ruleValues(input), userId, nextDueOn: firstDue(scheduleOf(input), today) })
    .returning();
  return row;
}

/** Changing the schedule restarts it from today; other edits keep the next date. */
export async function updateRule(db: Db, userId: string, id: string, input: RecurringInput, today: ISODate) {
  const existing = await getOwnedRule(db, userId, id);
  await assertEntryReferences(db, userId, input, existing);
  const scheduleChanged =
    existing.frequency !== input.frequency ||
    existing.interval !== input.interval ||
    existing.anchorDate !== input.anchorDate ||
    existing.endDate !== input.endDate;
  const [row] = await db
    .update(recurringRule)
    .set({
      ...ruleValues(input),
      ...(scheduleChanged && { nextDueOn: firstDue(scheduleOf(input), today) }),
    })
    .where(and(eq(recurringRule.id, id), eq(recurringRule.userId, userId)))
    .returning();
  return row;
}

export async function pauseRule(db: Db, userId: string, id: string) {
  await getOwnedRule(db, userId, id);
  await db.update(recurringRule).set({ active: false }).where(eq(recurringRule.id, id));
}

/** Resuming skips whatever came due while paused. */
export async function resumeRule(db: Db, userId: string, id: string, today: ISODate) {
  const r = await getOwnedRule(db, userId, id);
  await db
    .update(recurringRule)
    .set({ active: true, nextDueOn: occurrenceOnOrAfter(scheduleOf(r), today) })
    .where(eq(recurringRule.id, id));
}

/** Past entries stay; they just stop being linked to the rule. */
export async function deleteRule(db: Db, userId: string, id: string) {
  await getOwnedRule(db, userId, id);
  await db.delete(recurringRule).where(and(eq(recurringRule.id, id), eq(recurringRule.userId, userId)));
}

function entryFor(r: Rule, occurrenceOn: ISODate, overrides: { amountMinor?: number; occurredOn?: ISODate } = {}) {
  return {
    userId: r.userId,
    type: r.type,
    amountMinor: overrides.amountMinor ?? r.amountMinor,
    occurredOn: overrides.occurredOn ?? occurrenceOn,
    description: r.description,
    categoryId: r.categoryId,
    walletId: r.walletId,
    toWalletId: r.toWalletId,
    recurringRuleId: r.id,
    recurrenceOn: occurrenceOn,
    source: "recurring" as const,
  };
}

/**
 * Records every occurrence of an automatic rule up to `today` and moves its
 * cursor on. Idempotent and safe to run concurrently: the unique
 * (rule, occurrence date) key drops duplicates, and the cursor only moves if
 * nobody else moved it first.
 */
async function recordDue(db: Db, r: Rule, today: ISODate): Promise<number> {
  if (!r.active || r.mode !== "auto" || !r.nextDueOn || r.nextDueOn > today) return 0;
  const s = scheduleOf(r);
  const dates = occurrencesBetween(s, r.nextDueOn, today);
  const next = occurrenceOnOrAfter(s, addDays(dates.at(-1) ?? today, 1));
  return db.transaction(async (tx) => {
    const moved = await tx
      .update(recurringRule)
      .set({ nextDueOn: next })
      .where(and(eq(recurringRule.id, r.id), eq(recurringRule.nextDueOn, r.nextDueOn!)))
      .returning({ id: recurringRule.id });
    if (moved.length === 0) return 0; // someone else got here first
    if (dates.length === 0) return 0;
    const inserted = await tx
      .insert(transaction)
      .values(dates.map((d) => entryFor(r, d)))
      .onConflictDoNothing()
      .returning({ id: transaction.id });
    return inserted.length;
  });
}

/** Catches up one user's automatic rules. Called when pages load and by the cron job. */
export async function recordDueForUser(db: Db, userId: string, today: ISODate) {
  const due = await db
    .select()
    .from(recurringRule)
    .where(
      and(
        eq(recurringRule.userId, userId),
        eq(recurringRule.active, true),
        eq(recurringRule.mode, "auto"),
        lte(recurringRule.nextDueOn, today),
      ),
    );
  let count = 0;
  for (const r of due) count += await recordDue(db, r, today);
  return count;
}

/** The hourly job: every user's due rules, using each user's own "today". */
export async function recordDueForEveryone(db: Db, now: Date = new Date()) {
  // Anywhere on Earth is at most one day ahead of UTC.
  const horizon = addDays(now.toISOString().slice(0, 10), 1);
  const users = await db
    .selectDistinct({ id: user.id, timezone: user.timezone })
    .from(recurringRule)
    .innerJoin(user, eq(user.id, recurringRule.userId))
    .where(and(eq(recurringRule.active, true), eq(recurringRule.mode, "auto"), lte(recurringRule.nextDueOn, horizon)));
  let count = 0;
  for (const u of users) count += await recordDueForUser(db, u.id, todayInTz(u.timezone, now));
  return { users: users.length, recorded: count };
}

/** "Ask me first" rules whose date has come, waiting for the user. */
export async function listAwaitingConfirmation(db: Db, userId: string, today: ISODate) {
  const rows = (await listRules(db, userId)).filter(
    (r) => r.rule.active && r.rule.mode === "confirm" && r.rule.nextDueOn && r.rule.nextDueOn <= today,
  );
  return rows.map((r) => ({
    ...r,
    dueOn: r.rule.nextDueOn!,
    pendingCount: occurrencesBetween(scheduleOf(r.rule), r.rule.nextDueOn!, today).length,
  }));
}

async function advanceFrom(db: Db, r: Rule) {
  const next = occurrenceOnOrAfter(scheduleOf(r), addDays(r.nextDueOn!, 1));
  const moved = await db
    .update(recurringRule)
    .set({ nextDueOn: next })
    .where(and(eq(recurringRule.id, r.id), eq(recurringRule.nextDueOn, r.nextDueOn!)))
    .returning({ id: recurringRule.id });
  return moved.length > 0;
}

async function getDueConfirmRule(db: Db, userId: string, id: string, today: ISODate) {
  const r = await getOwnedRule(db, userId, id);
  if (r.mode !== "confirm" || !r.active || !r.nextDueOn || r.nextDueOn > today) {
    throw new UserError("Nothing is waiting for this item right now.");
  }
  return r;
}

/** Records the waiting occurrence with the real amount and date, then moves on. */
export async function confirmOccurrence(
  db: Db,
  userId: string,
  id: string,
  input: { amountMinor: number; occurredOn: ISODate },
  today: ISODate,
) {
  const r = await getDueConfirmRule(db, userId, id, today);
  await db.transaction(async (tx) => {
    if (!(await advanceFrom(tx, r))) throw new UserError("This was already recorded.");
    await tx.insert(transaction).values(entryFor(r, r.nextDueOn!, input)).onConflictDoNothing();
  });
}

export async function skipOccurrence(db: Db, userId: string, id: string, today: ISODate) {
  const r = await getDueConfirmRule(db, userId, id, today);
  await advanceFrom(db, r);
}

/** Dates coming up across active rules (both modes), soonest first. */
export async function listUpcoming(db: Db, userId: string, today: ISODate, days = 14) {
  const rows = await listRules(db, userId);
  const until = addDays(today, days);
  return rows
    .filter((r) => r.rule.active && r.rule.nextDueOn)
    .flatMap((r) => {
      const from = r.rule.nextDueOn! > today ? r.rule.nextDueOn! : addDays(today, 1);
      return occurrencesBetween(scheduleOf(r.rule), from, until, 10).map((date) => ({ ...r, date }));
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// Subscription suggestions
// ---------------------------------------------------------------------------

const SUGGESTION_KEY = (merchantKey: string) => `subsuggest:${merchantKey}`;
// A suggestion is only worth showing while the charges are still happening.
const STILL_ACTIVE_DAYS = { weekly: 14, monthly: 45, yearly: 400 } as const;

export async function listSubscriptionSuggestions(db: Db, userId: string, today: ISODate) {
  const [spend, rules, dismissed] = await Promise.all([
    db
      .select({
        id: transaction.id,
        description: transaction.description,
        amountMinor: transaction.amountMinor,
        occurredOn: transaction.occurredOn,
        categoryId: transaction.categoryId,
        walletId: transaction.walletId,
      })
      .from(transaction)
      .where(
        and(
          eq(transaction.userId, userId),
          eq(transaction.type, "expense"),
          isNull(transaction.recurringRuleId),
          sql`${transaction.occurredOn} >= ${addDays(today, -400)}`,
        ),
      ),
    db.select({ description: recurringRule.description }).from(recurringRule).where(eq(recurringRule.userId, userId)),
    db
      .select({ key: alertDismissal.alertKey })
      .from(alertDismissal)
      .where(and(eq(alertDismissal.userId, userId), sql`${alertDismissal.alertKey} like 'subsuggest:%'`)),
  ]);
  const ignore = new Set([
    ...rules.map((r) => normalizeMerchant(r.description)),
    ...dismissed.map((d) => d.key.slice("subsuggest:".length)),
  ]);
  return detectSubscriptions(spend, ignore).filter((c) => c.lastOn >= addDays(today, -STILL_ACTIVE_DAYS[c.frequency]));
}

/**
 * Turns a suggestion into a tracked subscription. Recomputed on the server (the
 * client only names it), starts from the next expected charge, and links the
 * past charges so price changes show up.
 */
export async function trackSubscription(db: Db, userId: string, merchantKey: string, today: ISODate) {
  const candidate = (await listSubscriptionSuggestions(db, userId, today)).find((c) => c.merchantKey === merchantKey);
  if (!candidate) throw new UserError("That suggestion is no longer available.");
  const w = await db
    .select({ archivedAt: wallet.archivedAt })
    .from(wallet)
    .where(and(eq(wallet.id, candidate.walletId), eq(wallet.userId, userId)));
  if (!w[0] || w[0].archivedAt) throw new UserError("The wallet these charges came from is archived. Restore it first.");
  await assertRoomFor(db, userId, "recurringItems");

  return db.transaction(async (tx) => {
    const schedule: Schedule = { frequency: candidate.frequency, interval: 1, anchorDate: candidate.nextExpectedOn, endDate: null };
    const [rule] = await tx
      .insert(recurringRule)
      .values({
        userId,
        type: "expense",
        amountMinor: candidate.amountMinor,
        description: candidate.name,
        categoryId: candidate.categoryId,
        walletId: candidate.walletId,
        frequency: candidate.frequency,
        interval: 1,
        anchorDate: candidate.nextExpectedOn,
        nextDueOn: firstDue(schedule, today),
        mode: "auto",
        isSubscription: true,
      })
      .returning();
    await tx
      .update(transaction)
      .set({ recurringRuleId: rule.id })
      .where(and(eq(transaction.userId, userId), inArray(transaction.id, candidate.transactionIds)));
    return rule;
  });
}

export async function dismissSubscriptionSuggestion(db: Db, userId: string, merchantKey: string) {
  await db.insert(alertDismissal).values({ userId, alertKey: SUGGESTION_KEY(merchantKey) }).onConflictDoNothing();
}
