import { sql } from "drizzle-orm";
// Relative on purpose: drizzle-kit loads this file without the "@/" alias.
import { DEFAULT_CURRENCY, DEFAULT_TIME_ZONE } from "../../config/defaults";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ---------------------------------------------------------------------------
// Better Auth tables (field names must match Better Auth's core schema)
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  // App profile fields, declared as Better Auth `additionalFields` (input: false).
  currency: text().notNull().default(DEFAULT_CURRENCY),
  timezone: text().notNull().default(DEFAULT_TIME_ZONE),
  onboardedAt: timestamp({ withTimezone: true }),
  aiEnabled: boolean().notNull().default(true),
  defaultWalletId: uuid().references((): AnyPgColumn => wallet.id, { onDelete: "set null" }),
  ...timestamps,
});

export const session = pgTable(
  "session",
  {
    id: text().primaryKey(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    token: text().notNull().unique(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index().on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    ...timestamps,
  },
  (t) => [index().on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index().on(t.identifier)],
);

// Better Auth's request counters ("<ip>|<path>"), shared by every server
// instance (rateLimit.storage "database" in src/server/auth.ts).
export const rateLimit = pgTable("rate_limit", {
  id: text().primaryKey(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  lastRequest: bigint({ mode: "number" }).notNull(), // milliseconds since 1970
});

// ---------------------------------------------------------------------------
// App tables
// ---------------------------------------------------------------------------

export const categoryKind = pgEnum("category_kind", ["income", "expense"]);

export const category = pgTable(
  "category",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text().notNull(),
    kind: categoryKind().notNull(),
    color: text().notNull(),
    icon: text().notNull(),
    // Display order within a kind: defaults first in a sensible order, then custom ones.
    position: integer().notNull().default(0),
    isDefault: boolean().notNull().default(false),
    archivedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("category_user_kind_name_key").on(t.userId, t.kind, sql`lower(${t.name})`)],
);

export const walletKind = pgEnum("wallet_kind", ["cash", "bank", "credit_card", "other"]);

export const wallet = pgTable(
  "wallet",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text().notNull(),
    kind: walletKind().notNull(),
    // Balance before the first entry. Negative for a credit card means money owed.
    openingBalanceMinor: bigint({ mode: "number" }).notNull().default(0),
    color: text().notNull(),
    archivedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("wallet_user_name_key").on(t.userId, sql`lower(${t.name})`)],
);

export const transactionType = pgEnum("transaction_type", ["income", "expense", "transfer"]);
export const transactionSource = pgEnum("transaction_source", ["manual", "nl", "recurring", "onboarding"]);

export const transaction = pgTable(
  "transaction",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: transactionType().notNull(),
    amountMinor: bigint({ mode: "number" }).notNull(),
    // Calendar date in the user's time zone. String mode avoids off-by-one shifts.
    occurredOn: date({ mode: "string" }).notNull(),
    description: text().notNull().default(""),
    notes: text(),
    merchantKey: text(),
    categoryId: uuid().references(() => category.id, { onDelete: "set null" }),
    // A wallet with entries is archived, never deleted. "no action" (checked at the
    // end of the statement) still lets deleting a user cascade through everything.
    walletId: uuid()
      .notNull()
      .references(() => wallet.id, { onDelete: "no action" }),
    toWalletId: uuid().references(() => wallet.id, { onDelete: "no action" }),
    recurringRuleId: uuid().references((): AnyPgColumn => recurringRule.id, { onDelete: "set null" }),
    // The scheduled date this entry was created for (stays put if the entry's date is edited).
    recurrenceOn: date({ mode: "string" }),
    source: transactionSource().notNull().default("manual"),
    ...timestamps,
  },
  (t) => [
    index("transaction_user_date_idx").on(t.userId, t.occurredOn.desc()),
    index("transaction_user_wallet_idx").on(t.userId, t.walletId),
    index("transaction_user_to_wallet_idx").on(t.userId, t.toWalletId),
    index("transaction_user_category_date_idx").on(t.userId, t.categoryId, t.occurredOn),
    // The daily limit on new entries counts by when they were added (src/config/limits.ts).
    index("transaction_user_created_idx").on(t.userId, t.createdAt),
    // Makes recording each scheduled occurrence idempotent.
    uniqueIndex("transaction_rule_occurrence_key").on(t.recurringRuleId, t.recurrenceOn),
    check("transaction_amount_positive", sql`${t.amountMinor} > 0`),
    // Transfers move money between two different wallets and have no category.
    check(
      "transaction_transfer_shape",
      sql`(${t.type} = 'transfer' AND ${t.toWalletId} IS NOT NULL AND ${t.toWalletId} <> ${t.walletId} AND ${t.categoryId} IS NULL)
        OR (${t.type} <> 'transfer' AND ${t.toWalletId} IS NULL)`,
    ),
  ],
);

// A budget with no category is the overall monthly spending limit (one per user).
export const budget = pgTable(
  "budget",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    categoryId: uuid().references(() => category.id, { onDelete: "cascade" }),
    amountMinor: bigint({ mode: "number" }).notNull(),
    // Leftovers (or overspending) carry into later months, counted from this month.
    rollover: boolean().notNull().default(false),
    rolloverFrom: date({ mode: "string" }),
    ...timestamps,
  },
  (t) => [
    unique("budget_user_category_key").on(t.userId, t.categoryId).nullsNotDistinct(),
    check("budget_amount_positive", sql`${t.amountMinor} > 0`),
    check(
      "budget_rollover_shape",
      sql`(${t.rollover} AND ${t.rolloverFrom} IS NOT NULL AND ${t.categoryId} IS NOT NULL) OR (NOT ${t.rollover} AND ${t.rolloverFrom} IS NULL)`,
    ),
  ],
);

export const goal = pgTable(
  "goal",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text().notNull(),
    targetMinor: bigint({ mode: "number" }).notNull(),
    targetDate: date({ mode: "string" }),
    icon: text().notNull(),
    color: text().notNull(),
    archivedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("goal_user_idx").on(t.userId), check("goal_target_positive", sql`${t.targetMinor} > 0`)],
);

// Money set aside for a goal (positive) or taken back out (negative). It's an
// earmark: wallet balances don't change.
export const goalContribution = pgTable(
  "goal_contribution",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    goalId: uuid()
      .notNull()
      .references(() => goal.id, { onDelete: "cascade" }),
    amountMinor: bigint({ mode: "number" }).notNull(),
    occurredOn: date({ mode: "string" }).notNull(),
    note: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("goal_contribution_goal_idx").on(t.goalId, t.occurredOn),
    check("goal_contribution_nonzero", sql`${t.amountMinor} <> 0`),
  ],
);

// Alerts are computed on the fly; this only remembers which ones were dismissed.
export const alertDismissal = pgTable(
  "alert_dismissal",
  {
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    alertKey: text().notNull(),
    dismissedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.alertKey] })],
);

export const recurrenceFrequency = pgEnum("recurrence_frequency", ["weekly", "monthly", "yearly"]);
export const recurrenceMode = pgEnum("recurrence_mode", ["auto", "confirm"]);

export const recurringRule = pgTable(
  "recurring_rule",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: transactionType().notNull(),
    amountMinor: bigint({ mode: "number" }).notNull(),
    description: text().notNull(),
    categoryId: uuid().references(() => category.id, { onDelete: "set null" }),
    walletId: uuid()
      .notNull()
      .references(() => wallet.id, { onDelete: "no action" }),
    toWalletId: uuid().references(() => wallet.id, { onDelete: "no action" }),
    frequency: recurrenceFrequency().notNull(),
    // Every N weeks/months/years.
    interval: integer().notNull().default(1),
    // The schedule is computed from this date (so Jan 31 → Feb 28 → Mar 31).
    anchorDate: date({ mode: "string" }).notNull(),
    endDate: date({ mode: "string" }),
    // The next occurrence not yet recorded or skipped. Null once the schedule ends.
    nextDueOn: date({ mode: "string" }),
    mode: recurrenceMode().notNull().default("auto"),
    isSubscription: boolean().notNull().default(false),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index("recurring_rule_due_idx")
      .on(t.nextDueOn)
      .where(sql`${t.active}`),
    index("recurring_rule_user_idx").on(t.userId),
    check("recurring_rule_amount_positive", sql`${t.amountMinor} > 0`),
    check("recurring_rule_interval", sql`${t.interval} between 1 and 52`),
    check(
      "recurring_rule_transfer_shape",
      sql`(${t.type} = 'transfer' AND ${t.toWalletId} IS NOT NULL AND ${t.toWalletId} <> ${t.walletId} AND ${t.categoryId} IS NULL)
        OR (${t.type} <> 'transfer' AND ${t.toWalletId} IS NULL)`,
    ),
  ],
);

// "Who was paid" → category, learned from the user's own entries so known
// merchants are categorized instantly without asking the AI.
export const merchantRule = pgTable(
  "merchant_rule",
  {
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    merchantKey: text().notNull(),
    categoryId: uuid()
      .notNull()
      .references(() => category.id, { onDelete: "cascade" }),
    hits: integer().notNull().default(1),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.merchantKey] })],
);

// Daily AI request counters: per user (scope "user:<id>"), across everyone
// ("global"), and per provider outcome ("provider:<name>").
export const aiUsage = pgTable(
  "ai_usage",
  {
    scope: text().notNull(),
    day: date({ mode: "string" }).notNull(),
    feature: text().notNull(),
    count: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.scope, t.day, t.feature] })],
);

// Server action calls in the current minute, one row per user
// (countActionCall in src/server/services/limits.ts).
export const actionRate = pgTable("action_rate", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  windowStart: timestamp({ withTimezone: true }).notNull(),
  count: integer().notNull(),
});

// One row per Razorpay subscription (a user may have several over time).
export const subscription = pgTable(
  "subscription",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    razorpaySubscriptionId: text().notNull().unique(),
    planKey: text().notNull(), // "monthly" | "yearly"
    // Razorpay's status: created, authenticated, active, pending, halted, cancelled, completed, expired, paused.
    status: text().notNull(),
    currentStart: timestamp({ withTimezone: true }),
    currentEnd: timestamp({ withTimezone: true }),
    endedAt: timestamp({ withTimezone: true }),
    cancelAtCycleEnd: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [index("subscription_user_idx").on(t.userId)],
);

// Razorpay may deliver the same webhook more than once; each event id is processed once.
export const paymentEvent = pgTable("payment_event", {
  eventId: text().primaryKey(),
  eventType: text().notNull(),
  receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// Cached insight reports: "2026-09" for a finished month, "2026-10:so-far" for a check-in.
export const insight = pgTable(
  "insight",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    period: text().notNull(),
    factsHash: text().notNull(),
    report: jsonb().notNull(),
    model: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("insight_user_period_key").on(t.userId, t.period)],
);
