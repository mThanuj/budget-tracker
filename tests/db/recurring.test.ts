import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RecurringInput } from "@/lib/validation";
import { recurringRule, transaction, user } from "@/server/db/schema";
import { seedNewUser } from "@/server/db/seed-defaults";
import { buildRecurringAlerts } from "@/server/services/alerts";
import { listCategories } from "@/server/services/categories";
import { UserError } from "@/server/services/errors";
import {
  confirmOccurrence,
  createRule,
  deleteRule,
  listAwaitingConfirmation,
  listRules,
  listSubscriptionSuggestions,
  listUpcoming,
  pauseRule,
  recordDueForEveryone,
  recordDueForUser,
  resumeRule,
  skipOccurrence,
  trackSubscription,
  updateRule,
  dismissSubscriptionSuggestion,
} from "@/server/services/recurring";
import { createTransaction, updateTransaction } from "@/server/services/transactions";
import { archiveWallet, createWallet, deleteWallet, listWallets } from "@/server/services/wallets";
import { createTestDb, createTestUser } from "./helpers";

type T = Awaited<ReturnType<typeof createTestDb>>;

async function setup(t: T, timezone = "Asia/Kolkata") {
  const u = await createTestUser(t.db, { timezone });
  await seedNewUser(t.db, u.id);
  const [cash] = await listWallets(t.db, u.id);
  const bank = await createWallet(t.db, u.id, { name: "SBI", kind: "bank", color: "#4a7fc1", openingBalanceMinor: 0 });
  const cats = Object.fromEntries((await listCategories(t.db, u.id)).map((c) => [c.name, c.id]));
  const rule = (over: Partial<RecurringInput> = {}): RecurringInput => ({
    type: "expense",
    amount: 15_000_00,
    description: "Rent",
    walletId: bank.id,
    toWalletId: null,
    categoryId: cats["Rent & Housing"],
    frequency: "monthly",
    interval: 1,
    anchorDate: "2026-07-01",
    endDate: null,
    mode: "auto",
    isSubscription: false,
    ...over,
  });
  return { userId: u.id, cash, bank, cats, rule };
}

const entriesOf = (t: T, ruleId: string) =>
  t.db.select().from(transaction).where(eq(transaction.recurringRuleId, ruleId)).orderBy(transaction.occurredOn);

describe("recurring rules", () => {
  let t: T;
  beforeAll(async () => {
    t = await createTestDb();
  });
  afterAll(() => t.close());

  it("doesn't back-fill when created, then catches up idempotently", async () => {
    const s = await setup(t);
    const r = await createRule(t.db, s.userId, s.rule(), "2026-07-20");
    expect(r.nextDueOn).toBe("2026-08-01"); // July 1 is in the past: not added

    // Away for three months, then two page loads race each other.
    const counts = await Promise.all([
      recordDueForUser(t.db, s.userId, "2026-10-24"),
      recordDueForUser(t.db, s.userId, "2026-10-24"),
    ]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(3);
    const rows = await entriesOf(t, r.id);
    expect(rows.map((e) => e.occurredOn)).toEqual(["2026-08-01", "2026-09-01", "2026-10-01"]);
    expect(rows.every((e) => e.source === "recurring" && e.amountMinor === 15_000_00)).toBe(true);

    expect(await recordDueForUser(t.db, s.userId, "2026-10-24")).toBe(0);
    const [after] = await t.db.select().from(recurringRule).where(eq(recurringRule.id, r.id));
    expect(after.nextDueOn).toBe("2026-11-01");
  });

  it("records today's occurrence when the rule starts today", async () => {
    const s = await setup(t);
    const r = await createRule(t.db, s.userId, s.rule({ anchorDate: "2026-10-24" }), "2026-10-24");
    expect(await recordDueForUser(t.db, s.userId, "2026-10-24")).toBe(1);
    expect((await entriesOf(t, r.id))[0].occurredOn).toBe("2026-10-24");
  });

  it("doesn't re-create an occurrence whose entry was edited or moved", async () => {
    const s = await setup(t);
    const r = await createRule(t.db, s.userId, s.rule({ anchorDate: "2026-10-01" }), "2026-10-01");
    await recordDueForUser(t.db, s.userId, "2026-10-01");
    const [e] = await entriesOf(t, r.id);
    await updateTransaction(t.db, s.userId, e.id, {
      type: "expense", amount: 15_500_00, occurredOn: "2026-10-03", description: "Rent", notes: null,
      walletId: s.bank.id, toWalletId: null, categoryId: s.cats["Rent & Housing"],
    });
    // Rewind the cursor as if a stale job ran: the unique key still prevents a duplicate.
    await t.db.update(recurringRule).set({ nextDueOn: "2026-10-01" }).where(eq(recurringRule.id, r.id));
    await recordDueForUser(t.db, s.userId, "2026-10-24");
    expect(await entriesOf(t, r.id)).toHaveLength(1);
  });

  it("waits for confirmation on ask-first rules, then records or skips", async () => {
    const s = await setup(t);
    const r = await createRule(
      t.db,
      s.userId,
      s.rule({ description: "Electricity", amount: 1_200_00, anchorDate: "2026-09-05", mode: "confirm", categoryId: s.cats["Bills & Utilities"] }),
      "2026-09-05",
    );
    expect(await recordDueForUser(t.db, s.userId, "2026-10-24")).toBe(0); // never automatic

    let waiting = await listAwaitingConfirmation(t.db, s.userId, "2026-10-24");
    expect(waiting.map((w) => [w.rule.description, w.dueOn, w.pendingCount])).toEqual([["Electricity", "2026-09-05", 2]]);

    await confirmOccurrence(t.db, s.userId, r.id, { amountMinor: 1_480_00, occurredOn: "2026-09-07" }, "2026-10-24");
    await skipOccurrence(t.db, s.userId, r.id, "2026-10-24");
    waiting = await listAwaitingConfirmation(t.db, s.userId, "2026-10-24");
    expect(waiting).toHaveLength(0);
    const rows = await entriesOf(t, r.id);
    expect(rows.map((e) => [e.occurredOn, e.recurrenceOn, e.amountMinor])).toEqual([["2026-09-07", "2026-09-05", 1_480_00]]);
    await expect(skipOccurrence(t.db, s.userId, r.id, "2026-10-24")).rejects.toThrow(/Nothing is waiting/);
  });

  it("skips what came due while paused", async () => {
    const s = await setup(t);
    const r = await createRule(t.db, s.userId, s.rule({ anchorDate: "2026-08-01" }), "2026-08-01");
    await pauseRule(t.db, s.userId, r.id);
    expect(await recordDueForUser(t.db, s.userId, "2026-10-24")).toBe(0);
    await resumeRule(t.db, s.userId, r.id, "2026-10-24");
    await recordDueForUser(t.db, s.userId, "2026-10-24");
    expect(await entriesOf(t, r.id)).toHaveLength(0);
    const [after] = await t.db.select().from(recurringRule).where(eq(recurringRule.id, r.id));
    expect(after.nextDueOn).toBe("2026-11-01");
  });

  it("restarts the schedule when it changes and stops at the end date", async () => {
    const s = await setup(t);
    const r = await createRule(t.db, s.userId, s.rule({ anchorDate: "2026-11-01" }), "2026-10-24");
    const moved = await updateRule(t.db, s.userId, r.id, s.rule({ anchorDate: "2026-11-05", endDate: "2026-12-31" }), "2026-10-24");
    expect(moved.nextDueOn).toBe("2026-11-05");
    await recordDueForUser(t.db, s.userId, "2027-02-01");
    expect((await entriesOf(t, r.id)).map((e) => e.occurredOn)).toEqual(["2026-11-05", "2026-12-05"]);
    const [after] = await t.db.select().from(recurringRule).where(eq(recurringRule.id, r.id));
    expect(after.nextDueOn).toBeNull();
  });

  it("records transfers between wallets", async () => {
    const s = await setup(t);
    const r = await createRule(
      t.db,
      s.userId,
      s.rule({ type: "transfer", description: "To cash", amount: 5_000_00, toWalletId: s.cash.id, categoryId: null, anchorDate: "2026-10-01" }),
      "2026-10-01",
    );
    await recordDueForUser(t.db, s.userId, "2026-10-01");
    const balances = Object.fromEntries((await listWallets(t.db, s.userId)).map((w) => [w.name, w.balanceMinor]));
    expect(balances).toMatchObject({ Cash: 5_000_00, SBI: -5_000_00 });
    expect((await entriesOf(t, r.id))[0].type).toBe("transfer");
  });

  it("keeps rules private to their owner", async () => {
    const a = await setup(t);
    const b = await setup(t);
    const r = await createRule(t.db, a.userId, a.rule(), "2026-10-24");
    await expect(createRule(t.db, b.userId, b.rule({ walletId: a.bank.id }), "2026-10-24")).rejects.toThrow(UserError);
    await expect(pauseRule(t.db, b.userId, r.id)).rejects.toThrow(UserError);
    await expect(deleteRule(t.db, b.userId, r.id)).rejects.toThrow(UserError);
    expect(await listRules(t.db, b.userId)).toHaveLength(0);
  });

  it("pauses rules when their wallet is archived and blocks deleting a wallet in use", async () => {
    const s = await setup(t);
    const r = await createRule(t.db, s.userId, s.rule({ walletId: s.cash.id }), "2026-10-24");
    await expect(deleteWallet(t.db, s.userId, s.cash.id)).rejects.toThrow(/recurring item uses this wallet/);
    await archiveWallet(t.db, s.userId, s.cash.id);
    const [after] = await t.db.select().from(recurringRule).where(eq(recurringRule.id, r.id));
    expect(after.active).toBe(false);
  });

  it("keeps past entries when a rule is deleted", async () => {
    const s = await setup(t);
    const r = await createRule(t.db, s.userId, s.rule({ anchorDate: "2026-10-01" }), "2026-10-01");
    await recordDueForUser(t.db, s.userId, "2026-10-01");
    await deleteRule(t.db, s.userId, r.id);
    const rows = await t.db.select().from(transaction).where(and(eq(transaction.userId, s.userId), eq(transaction.description, "Rent")));
    expect(rows).toHaveLength(1);
    expect(rows[0].recurringRuleId).toBeNull();
  });

  it("lists upcoming dates and builds due-soon reminders", async () => {
    const s = await setup(t);
    await createRule(t.db, s.userId, s.rule({ anchorDate: "2026-10-26" }), "2026-10-24");
    await createRule(t.db, s.userId, s.rule({ description: "Gym", amount: 1_500_00, anchorDate: "2026-11-05", categoryId: null }), "2026-10-24");
    const upcoming = await listUpcoming(t.db, s.userId, "2026-10-24");
    expect(upcoming.map((u) => [u.rule.description, u.date])).toEqual([["Rent", "2026-10-26"], ["Gym", "2026-11-05"]]);

    const alerts = buildRecurringAlerts({ upcoming, rules: await listRules(t.db, s.userId), today: "2026-10-24", currency: "INR" });
    expect(alerts.map((a) => a.title)).toEqual(["Rent is due on Mon, 26 Oct"]); // Gym is more than 3 days away
  });
});

describe("subscriptions", () => {
  let t: T;
  beforeAll(async () => {
    t = await createTestDb();
  });
  afterAll(() => t.close());

  async function seedNetflix(s: Awaited<ReturnType<typeof setup>>) {
    for (const [date, amount] of [["2026-07-12", 649_00], ["2026-08-12", 649_00], ["2026-09-12", 649_00], ["2026-10-12", 799_00]] as const) {
      await createTransaction(t.db, s.userId, {
        type: "expense", amount, occurredOn: date, description: "Netflix", notes: null,
        walletId: s.bank.id, toWalletId: null, categoryId: s.cats.Subscriptions,
      });
    }
  }

  it("suggests repeating charges, tracks them without double-recording, and flags price changes", async () => {
    const s = await setup(t);
    await seedNetflix(s);
    const [suggestion] = await listSubscriptionSuggestions(t.db, s.userId, "2026-10-24");
    expect(suggestion).toMatchObject({ merchantKey: "netflix", frequency: "monthly", amountMinor: 799_00, nextExpectedOn: "2026-11-12" });

    const rule = await trackSubscription(t.db, s.userId, "netflix", "2026-10-24");
    expect(rule).toMatchObject({ isSubscription: true, nextDueOn: "2026-11-12", amountMinor: 799_00 });
    expect(await entriesOf(t, rule.id)).toHaveLength(4); // past charges linked, nothing new
    expect(await listSubscriptionSuggestions(t.db, s.userId, "2026-10-24")).toHaveLength(0);

    const alerts = buildRecurringAlerts({ upcoming: [], rules: await listRules(t.db, s.userId), today: "2026-10-24", currency: "INR" });
    expect(alerts).toEqual([
      expect.objectContaining({ tone: "warning", title: "Netflix went up to ₹799.00", body: expect.stringContaining("₹649.00") }),
    ]);
  });

  it("forgets suggestions the user dismissed, and stale ones", async () => {
    const s = await setup(t);
    await seedNetflix(s);
    expect(await listSubscriptionSuggestions(t.db, s.userId, "2027-03-01")).toHaveLength(0); // stopped months ago
    await dismissSubscriptionSuggestion(t.db, s.userId, "netflix");
    expect(await listSubscriptionSuggestions(t.db, s.userId, "2026-10-24")).toHaveLength(0);
    await expect(trackSubscription(t.db, s.userId, "netflix", "2026-10-24")).rejects.toThrow(/no longer available/);
  });
});

describe("the hourly job", () => {
  it("uses each user's own date", async () => {
    const t = await createTestDb();
    const india = await setup(t, "Asia/Kolkata");
    const usa = await setup(t, "America/Los_Angeles");
    await createRule(t.db, india.userId, india.rule({ anchorDate: "2026-11-01" }), "2026-10-24");
    await createRule(t.db, usa.userId, usa.rule({ anchorDate: "2026-11-01" }), "2026-10-24");

    // 20:00 UTC on Oct 31: already Nov 1 in India, still Oct 31 in California.
    const result = await recordDueForEveryone(t.db, new Date("2026-10-31T20:00:00Z"));
    expect(result.recorded).toBe(1);
    const recorded = await t.db.select({ userId: transaction.userId }).from(transaction).where(eq(transaction.source, "recurring"));
    expect(recorded.map((r) => r.userId)).toEqual([india.userId]);
    expect(await t.db.select().from(user)).toHaveLength(2);
    await t.close();
  });
});
