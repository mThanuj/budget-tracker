import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/server/db/schema";
import { seedNewUser } from "@/server/db/seed-defaults";
import { dismissAlert } from "@/server/services/alerts";
import { createCategory } from "@/server/services/categories";
import { UserError } from "@/server/services/errors";
import { addContribution, createGoal } from "@/server/services/goals";
import { createRule, dismissSubscriptionSuggestion } from "@/server/services/recurring";
import { countActionCall } from "@/server/services/limits";
import { applySetup } from "@/server/services/setup";
import { createTransaction } from "@/server/services/transactions";
import { archiveWallet, createWallet, listWallets } from "@/server/services/wallets";
import { createTestDb, createTestUser, freeCategoryColor } from "./helpers";

// Small limits so each can be reached quickly; the real ones are in src/config/limits.ts.
vi.mock("@/config/limits", async () => {
  const { DEFAULT_CATEGORIES } = await import("@/lib/default-categories");
  return {
    LIMITS: {
      wallets: 3,
      categories: DEFAULT_CATEGORIES.length + 1,
      goals: 2,
      recurringItems: 2,
      entriesPerDay: 3,
      goalContributionsPerDay: 2,
      alertDismissalsPerDay: 2,
    },
  };
});

const today = "2026-10-25";
let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

async function newUser() {
  const u = await createTestUser(t.db);
  await seedNewUser(t.db, u.id); // default categories and a Cash wallet
  const [cash] = await listWallets(t.db, u.id);
  return { id: u.id, cash: cash.id };
}
const wallet = (name: string) => ({ name, kind: "bank" as const, color: "#4a7fc1", openingBalanceMinor: 0 });
const entry = (walletId: string) => ({
  type: "expense" as const,
  amount: 10_00,
  occurredOn: today,
  description: "Chai",
  notes: null,
  walletId,
  toWalletId: null,
  categoryId: null,
});
const rule = (walletId: string, description: string) => ({
  type: "expense" as const,
  amount: 99_00,
  description,
  walletId,
  toWalletId: null,
  categoryId: null,
  frequency: "monthly" as const,
  interval: 1 as const,
  anchorDate: "2026-11-01",
  endDate: null,
  mode: "confirm" as const,
  isSubscription: false,
});
const refused = (p: Promise<unknown>) => expect(p).rejects.toBeInstanceOf(UserError);

describe("per-account limits", () => {
  it("caps wallets, counting archived ones (archiving would otherwise reset it)", async () => {
    const u = await newUser();
    const bank = await createWallet(t.db, u.id, wallet("Bank"));
    await archiveWallet(t.db, u.id, bank.id);
    await createWallet(t.db, u.id, wallet("Card"));
    await expect(createWallet(t.db, u.id, wallet("One more"))).rejects.toThrow(
      "You can have up to 3 wallets, and archived ones count too.",
    );
  });

  it("caps categories, goals and recurring items", async () => {
    const u = await newUser();
    const color = await freeCategoryColor(t.db, u.id, "expense");
    await createCategory(t.db, u.id, { name: "Pets", kind: "expense", icon: "tag", color });
    await refused(createCategory(t.db, u.id, { name: "Plants", kind: "expense", icon: "tag", color }));

    const goal = { target: 1_000_00, targetDate: null, icon: "tag", color: "#4a7fc1" } as const;
    await createGoal(t.db, u.id, { ...goal, name: "Bike" });
    await createGoal(t.db, u.id, { ...goal, name: "Phone" });
    await refused(createGoal(t.db, u.id, { ...goal, name: "Trip" }));

    await createRule(t.db, u.id, rule(u.cash, "Rent"), today);
    await createRule(t.db, u.id, rule(u.cash, "Gym"), today);
    await refused(createRule(t.db, u.id, rule(u.cash, "Netflix"), today));
  });

  it("limits new entries per 24 hours, not counting older ones or recurring ones the app records", async () => {
    const u = await newUser();
    for (let i = 0; i < 3; i++) await createTransaction(t.db, u.id, entry(u.cash));
    await expect(createTransaction(t.db, u.id, entry(u.cash))).rejects.toThrow(
      "That's 3 entries in the last 24 hours, the most allowed in a day.",
    );

    // A day later there's room again; recurring entries never count.
    await t.db
      .update(schema.transaction)
      .set({ createdAt: sql`now() - interval '25 hours'` })
      .where(eq(schema.transaction.userId, u.id));
    await t.db.insert(schema.transaction).values({ ...entryRow(u), source: "recurring" });
    await t.db.insert(schema.transaction).values({ ...entryRow(u), source: "recurring" });
    for (let i = 0; i < 3; i++) await createTransaction(t.db, u.id, entry(u.cash));
    await refused(createTransaction(t.db, u.id, entry(u.cash)));
  });

  it("limits goal savings and dismissed alerts per day", async () => {
    const u = await newUser();
    const g = await createGoal(t.db, u.id, {
      name: "Bike",
      target: 1_000_00,
      targetDate: null,
      icon: "tag",
      color: "#4a7fc1",
    });
    const add = { direction: "add" as const, amount: 10_00, occurredOn: today, note: null };
    await addContribution(t.db, u.id, g.id, add);
    await addContribution(t.db, u.id, g.id, add);
    await refused(addContribution(t.db, u.id, g.id, add));

    const key = (n: number) => `budget:${crypto.randomUUID()}:2026-10:${n}`;
    await dismissAlert(t.db, u.id, key(80));
    await dismissAlert(t.db, u.id, key(100));
    await refused(dismissAlert(t.db, u.id, key(80)));
    // Dismissed subscription suggestions are stored the same way and share the limit.
    await refused(dismissSubscriptionSuggestion(t.db, u.id, "netflix"));
    const other = await newUser();
    await dismissSubscriptionSuggestion(t.db, other.id, "netflix");
    await dismissSubscriptionSuggestion(t.db, other.id, "spotify");
    await refused(dismissSubscriptionSuggestion(t.db, other.id, "gym"));
  });

  it("checks the setup flow's new wallets too, and saves nothing when over", async () => {
    const u = await newUser();
    const input = {
      wallets: ["A", "B", "C"].map((name) => ({ name, kind: "bank" as const, balance: 0 })),
      incomes: [],
      bills: [],
      goals: [],
      incomeWallet: "",
      billsWallet: "",
      limit: 0,
      categoryBudgets: [],
    };
    await refused(applySetup(t.db, u.id, input, today)); // Cash + 3 new would be 4
    expect(await listWallets(t.db, u.id, { includeArchived: true })).toHaveLength(1);
    expect(await applySetup(t.db, u.id, { ...input, wallets: input.wallets.slice(0, 2) }, today)).toMatchObject({
      wallets: 2,
    });
  });

  it("are per account: one account at its limit doesn't affect another", async () => {
    const full = await newUser();
    for (let i = 0; i < 3; i++) await createTransaction(t.db, full.id, entry(full.cash));
    const other = await newUser();
    await expect(createTransaction(t.db, other.id, entry(other.cash))).resolves.toMatchObject({ userId: other.id });
  });
});

describe("server action calls per minute (countActionCall)", () => {
  const at = (time: string) => new Date(`2026-10-25T${time}Z`);

  it("counts each call in the same minute, and starts again in the next", async () => {
    const u = await newUser();
    expect(await countActionCall(t.db, u.id, at("10:00:00"))).toBe(1);
    expect(await countActionCall(t.db, u.id, at("10:00:30"))).toBe(2);
    expect(await countActionCall(t.db, u.id, at("10:00:59.999"))).toBe(3);
    expect(await countActionCall(t.db, u.id, at("10:01:00"))).toBe(1);
    expect(await countActionCall(t.db, u.id, at("10:07:15"))).toBe(1);
  });

  it("adds a call stamped a little earlier (a server clock behind) to the current minute", async () => {
    const u = await newUser();
    await countActionCall(t.db, u.id, at("10:01:05"));
    expect(await countActionCall(t.db, u.id, at("10:00:58"))).toBe(2);
    expect(await countActionCall(t.db, u.id, at("10:01:10"))).toBe(3);
  });

  it("counts calls made at the same moment exactly, one row per user, per user", async () => {
    const u = await newUser();
    const other = await newUser();
    const counts = await Promise.all(Array.from({ length: 10 }, () => countActionCall(t.db, u.id, at("11:00:00"))));
    expect(counts.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(await countActionCall(t.db, other.id, at("11:00:00"))).toBe(1);
    expect(await t.db.$count(schema.actionRate, eq(schema.actionRate.userId, u.id))).toBe(1);
  });

  it("goes with the account", async () => {
    const u = await newUser();
    await countActionCall(t.db, u.id, at("12:00:00"));
    await t.db.delete(schema.user).where(eq(schema.user.id, u.id));
    expect(await t.db.$count(schema.actionRate, eq(schema.actionRate.userId, u.id))).toBe(0);
  });
});

function entryRow(u: { id: string; cash: string }) {
  return {
    userId: u.id,
    type: "expense" as const,
    amountMinor: 10_00,
    occurredOn: today,
    description: "Rent",
    walletId: u.cash,
  };
}
