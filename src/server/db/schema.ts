import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
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
  currency: text().notNull().default("INR"),
  timezone: text().notNull().default("Asia/Kolkata"),
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
export const transactionSource = pgEnum("transaction_source", [
  "manual",
  "nl",
  "recurring",
  "onboarding",
]);

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
    source: transactionSource().notNull().default("manual"),
    ...timestamps,
  },
  (t) => [
    index("transaction_user_date_idx").on(t.userId, t.occurredOn.desc()),
    index("transaction_user_wallet_idx").on(t.userId, t.walletId),
    index("transaction_user_to_wallet_idx").on(t.userId, t.toWalletId),
    index("transaction_user_category_date_idx").on(t.userId, t.categoryId, t.occurredOn),
    check("transaction_amount_positive", sql`${t.amountMinor} > 0`),
    // Transfers move money between two different wallets and have no category.
    check(
      "transaction_transfer_shape",
      sql`(${t.type} = 'transfer' AND ${t.toWalletId} IS NOT NULL AND ${t.toWalletId} <> ${t.walletId} AND ${t.categoryId} IS NULL)
        OR (${t.type} <> 'transfer' AND ${t.toWalletId} IS NULL)`,
    ),
  ],
);
