// Access control, as an attacker would probe it: server actions are public
// endpoints that anyone can call with any arguments. Two sweeps over the real
// actions on an in-memory Postgres (only the session and Next's request APIs
// are stand-ins), so a new action can't quietly skip a check:
//  - every action refuses when nobody is signed in;
//  - no action reads or changes another user's records, whichever id it's given.
import { readdirSync } from "node:fs";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/server/db/schema";

const session = vi.hoisted(() => ({ user: null as null | typeof import("@/server/db/schema").user.$inferSelect }));

vi.mock("@/server/db", async () => {
  const { createTestDb } = await import("../db/helpers");
  return { db: (await createTestDb()).db };
});
vi.mock("@/server/session", async () => {
  const { redirect } = await import("next/navigation");
  return {
    requireUser: vi.fn(async () => session.user ?? redirect("/?signed-out=1")),
    getSession: vi.fn(async () => (session.user ? { user: session.user } : null)),
  };
});
vi.mock("next/cache", () => ({ refresh: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({ getAll: () => [], delete: vi.fn() })),
}));
vi.mock("@/server/auth", () => ({ auth: { api: { signOut: vi.fn(async () => undefined) } } }));

const { db } = await import("@/server/db");
const { createTestUser } = await import("../db/helpers");
const { seedNewUser } = await import("@/server/db/seed-defaults");
const { todayInTz } = await import("@/lib/dates");

const isRedirect = (err: unknown) => err instanceof Error && "digest" in err && String(err.digest).startsWith("NEXT_REDIRECT");
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
};
const today = todayInTz("Asia/Kolkata");

async function newUser(name: string) {
  const row = await createTestUser(db, { name, onboardedAt: new Date(), timezone: "Asia/Kolkata", currency: "INR" });
  await seedNewUser(db, row.id);
  const [fresh] = await db.select().from(schema.user).where(eq(schema.user.id, row.id));
  return fresh;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("every server action refuses when nobody is signed in", () => {
  // Listed from disk on every run (import.meta.glob is fixed when the file is
  // transformed, so a cached transform could miss a newly added action file).
  const dir = new URL("../../src/server/actions/", import.meta.url);
  const modules = Object.fromEntries(
    readdirSync(dir)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => [f, () => import(/* @vite-ignore */ new URL(f, dir).pathname) as Promise<Record<string, unknown>>]),
  );

  it("with a redirect to the landing page, before touching any data", async () => {
    session.user = null;
    const before = await db.$count(schema.transaction);
    const checked: string[] = [];
    for (const [path, load] of Object.entries(modules)) {
      for (const [name, fn] of Object.entries(await load())) {
        if (typeof fn !== "function") continue;
        const result = Reflect.apply(fn, null, [undefined, new FormData()]).then(
          () => "resolved",
          (err: unknown) => (isRedirect(err) ? "redirected" : `threw ${String(err)}`),
        );
        expect(await result, `${path} › ${name}`).toBe("redirected");
        checked.push(name);
      }
    }
    expect(checked.length).toBeGreaterThanOrEqual(32); // every exported action was tried
    expect(await db.$count(schema.transaction)).toBe(before);
  });
});

describe("no action touches another user's records", async () => {
  const { saveWallet, walletAction } = await import("@/server/actions/wallets");
  const { categoryAction, saveCategory } = await import("@/server/actions/categories");
  const { goalAction, saveContribution, saveGoal } = await import("@/server/actions/goals");
  const { confirmDue, ruleAction, saveRule } = await import("@/server/actions/recurring");
  const { removeBudget, saveBudget } = await import("@/server/actions/budgets");
  const { removeTransaction, saveTransaction } = await import("@/server/actions/transactions");

  let alice: typeof schema.user.$inferSelect;
  let aliceCash: string;
  let aliceGroceries: string;
  const bob = { walletId: "", categoryId: "", goalId: "", ruleId: "", budgetId: "", transactionId: "" };
  let bobId: string;

  /** Everything Bob owns, to compare before and after Alice's attempts. */
  const bobsRows = async () => ({
    wallets: await db.select().from(schema.wallet).where(eq(schema.wallet.userId, bobId)),
    categories: await db.select().from(schema.category).where(eq(schema.category.userId, bobId)),
    goals: await db.select().from(schema.goal).where(eq(schema.goal.userId, bobId)),
    contributions: await db.select().from(schema.goalContribution).where(eq(schema.goalContribution.goalId, bob.goalId)),
    rules: await db.select().from(schema.recurringRule).where(eq(schema.recurringRule.userId, bobId)),
    budgets: await db.select().from(schema.budget).where(eq(schema.budget.userId, bobId)),
    transactions: await db.select().from(schema.transaction).where(eq(schema.transaction.userId, bobId)),
    user: await db.select().from(schema.user).where(eq(schema.user.id, bobId)),
  });

  beforeAll(async () => {
    alice = await newUser("Alice");
    const bobUser = await newUser("Bob");
    bobId = bobUser.id;
    // Bob's records are made through the same actions, as Bob.
    session.user = bobUser;
    const ok = (r: unknown) => expect(r).toEqual({ ok: true });
    ok(await saveWallet(undefined, form({ name: "Bob's bank", kind: "bank", color: "#3f9b74", openingBalance: "1000" })));
    ok(await saveCategory(undefined, form({ name: "Bob's pets", kind: "expense", icon: "tag", color: "#3f9b74" })));
    ok(await saveGoal(undefined, form({ name: "Bob's bike", target: "5000", icon: "tag", color: "#3f9b74" })));
    const [bobBank] = await db.select().from(schema.wallet).where(eq(schema.wallet.name, "Bob's bank"));
    const [bobPets] = await db.select().from(schema.category).where(eq(schema.category.name, "Bob's pets"));
    const [bobBike] = await db.select().from(schema.goal).where(eq(schema.goal.userId, bobId));
    ok(await saveContribution(undefined, form({ goalId: bobBike.id, direction: "add", amount: "500", occurredOn: today })));
    ok(await saveRule(undefined, form({
      type: "expense", amount: "300", description: "Bob's rent", walletId: bobBank.id, categoryId: bobPets.id,
      repeat: "monthly-1", anchorDate: today, mode: "confirm",
    })));
    ok(await saveBudget(undefined, form({ categoryId: bobPets.id, amount: "2000" })));
    ok(await saveTransaction(undefined, form({
      type: "expense", amount: "120", occurredOn: today, description: "Bob's lunch", walletId: bobBank.id, categoryId: bobPets.id,
    })));
    const [rule] = await db.select().from(schema.recurringRule).where(eq(schema.recurringRule.userId, bobId));
    const [bud] = await db.select().from(schema.budget).where(eq(schema.budget.userId, bobId));
    const [tx] = await db.select().from(schema.transaction).where(eq(schema.transaction.description, "Bob's lunch"));
    Object.assign(bob, { walletId: bobBank.id, categoryId: bobPets.id, goalId: bobBike.id, ruleId: rule.id, budgetId: bud.id, transactionId: tx.id });

    const [cash] = await db.select().from(schema.wallet).where(eq(schema.wallet.userId, alice.id));
    const [groceries] = await db.select().from(schema.category).where(eq(schema.category.userId, alice.id));
    aliceCash = cash.id;
    aliceGroceries = groceries.id;
  });

  it("refuses every id that belongs to Bob, as if it didn't exist, and changes nothing of his", async () => {
    session.user = alice;
    const before = await bobsRows();
    const attempts: [string, () => Promise<unknown>][] = [
      ["edit Bob's wallet", () => saveWallet(undefined, form({ id: bob.walletId, name: "Mine now", kind: "bank", color: "#3f9b74", openingBalance: "0" }))],
      ...(["archive", "restore", "delete", "makeDefault"] as const).map(
        (op): [string, () => Promise<unknown>] => [`${op} Bob's wallet`, () => walletAction(op, bob.walletId)],
      ),
      ["edit Bob's category", () => saveCategory(undefined, form({ id: bob.categoryId, name: "Mine now", icon: "tag", color: "#3f9b74" }))],
      ...(["archive", "restore", "delete"] as const).map(
        (op): [string, () => Promise<unknown>] => [`${op} Bob's category`, () => categoryAction(op, bob.categoryId)],
      ),
      ["edit Bob's goal", () => saveGoal(undefined, form({ id: bob.goalId, name: "Mine now", target: "1", icon: "tag", color: "#3f9b74" }))],
      ["withdraw from Bob's goal", () => saveContribution(undefined, form({ goalId: bob.goalId, direction: "withdraw", amount: "500", occurredOn: today }))],
      ...(["archive", "restore", "delete"] as const).map(
        (op): [string, () => Promise<unknown>] => [`${op} Bob's goal`, () => goalAction(op, bob.goalId)],
      ),
      ["edit Bob's recurring item", () => saveRule(undefined, form({
        id: bob.ruleId, type: "expense", amount: "1", description: "Mine now", walletId: aliceCash, repeat: "monthly-1", anchorDate: today, mode: "confirm",
      }))],
      ...(["pause", "resume", "delete", "skip"] as const).map(
        (op): [string, () => Promise<unknown>] => [`${op} Bob's recurring item`, () => ruleAction(op, bob.ruleId)],
      ),
      ["record Bob's recurring item", () => confirmDue(undefined, form({ ruleId: bob.ruleId, amount: "300", occurredOn: today }))],
      ["edit Bob's budget", () => saveBudget(undefined, form({ id: bob.budgetId, categoryId: aliceGroceries, amount: "1" }))],
      ["remove Bob's budget", () => removeBudget(bob.budgetId)],
      ["budget on Bob's category", () => saveBudget(undefined, form({ categoryId: bob.categoryId, amount: "1" }))],
      ["edit Bob's entry", () => saveTransaction(undefined, form({
        id: bob.transactionId, type: "expense", amount: "1", occurredOn: today, description: "Mine now", walletId: aliceCash,
      }))],
      ["delete Bob's entry", () => removeTransaction(bob.transactionId)],
      ["spend from Bob's wallet", () => saveTransaction(undefined, form({ type: "expense", amount: "1", occurredOn: today, description: "x", walletId: bob.walletId }))],
      ["move money into Bob's wallet", () => saveTransaction(undefined, form({
        type: "transfer", amount: "1", occurredOn: today, description: "x", walletId: aliceCash, toWalletId: bob.walletId,
      }))],
      ["file an entry under Bob's category", () => saveTransaction(undefined, form({
        type: "expense", amount: "1", occurredOn: today, description: "x", walletId: aliceCash, categoryId: bob.categoryId,
      }))],
      ["recurring item on Bob's wallet", () => saveRule(undefined, form({
        type: "expense", amount: "1", description: "x", walletId: bob.walletId, repeat: "monthly-1", anchorDate: today, mode: "confirm",
      }))],
    ];

    for (const [what, attempt] of attempts) {
      const result = await attempt();
      // The refusal must be the ownership check ("doesn't exist"), not a form error that hides it.
      expect(JSON.stringify(result), what).toMatch(/"ok":false.*doesn't exist/);
    }
    expect(await bobsRows()).toEqual(before);
  });

  it("ignores ownership fields a request slips in (mass assignment)", async () => {
    session.user = alice;
    const sneaky = form({
      type: "expense", amount: "75", occurredOn: today, description: "Sneaky", walletId: aliceCash,
      userId: bobId, source: "recurring", recurringRuleId: bob.ruleId,
    });
    expect(await saveTransaction(undefined, sneaky)).toEqual({ ok: true });
    const [row] = await db.select().from(schema.transaction).where(eq(schema.transaction.description, "Sneaky"));
    expect(row).toMatchObject({ userId: alice.id, source: "manual", recurringRuleId: null });
  });
});
