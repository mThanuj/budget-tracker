// Access control, as an attacker would probe it: server actions are public
// endpoints that anyone can call with any arguments. Sweeps over the real
// actions on an in-memory Postgres (only the session, Next's request APIs and
// Razorpay's API are stand-ins), so a new action can't quietly skip a check:
//  - every action refuses when nobody is signed in;
//  - every action is on a reviewed list saying why it can't reach another
//    user's records, so a new one fails until someone has looked;
//  - no action reads or changes another user's records, whichever id it's given.
import { createHmac } from "node:crypto";
import { readdirSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
// Razorpay's API is the outside world: its calls are stand-ins, the signature checks are real.
vi.mock("@/server/billing/razorpay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/billing/razorpay")>()),
  createSubscription: vi.fn(),
  fetchSubscription: vi.fn(),
  cancelSubscriptionAtCycleEnd: vi.fn(),
  cancelSubscriptionNow: vi.fn(),
}));

const { db } = await import("@/server/db");
const { createTestUser } = await import("../db/helpers");
const { seedNewUser } = await import("@/server/db/seed-defaults");
const { addDays, addMonths, monthOf, todayInTz } = await import("@/lib/dates");
const { formatMoney } = await import("@/lib/money");
const razorpay = await import("@/server/billing/razorpay");

const isRedirect = (err: unknown) =>
  err instanceof Error && "digest" in err && String(err.digest).startsWith("NEXT_REDIRECT");
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
afterEach(() => {
  vi.unstubAllEnvs();
});

// Listed from disk on every run (import.meta.glob is fixed when the file is
// transformed, so a cached transform could miss a newly added action file).
const dir = new URL("../../src/server/actions/", import.meta.url);
const modules = Object.fromEntries(
  readdirSync(dir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => [f, () => import(/* @vite-ignore */ new URL(f, dir).pathname) as Promise<Record<string, unknown>>]),
);

/**
 * Every server action, and why it can't reach another user's records. "Below"
 * means it's tried with Bob's ids or keys in "no action touches another user's
 * records"; a new action that takes any needs its attempts there too.
 */
const REVIEWED: Record<string, string> = {
  "account.ts › signOut": "no input; ends the caller's own session",
  "account.ts › deleteAccount": "no ids; deletes the caller's own account",
  "admin.ts › sendTestError": "no input; admins only, reads and writes no records",
  "ai.ts › parseEntryText": "text only; matched against the caller's own wallets and categories",
  "ai.ts › suggestCategoryFor": "text only; picks from the caller's own categories",
  "alerts.ts › dismissAlert": "an alert key holding an id: below",
  "billing.ts › startCheckout": "no ids; reuses only the caller's own pending checkout: below",
  "billing.ts › confirmCheckout": "a subscription id: below",
  "billing.ts › checkPaymentStatus": "no input; syncs only the caller's own payments: below",
  "billing.ts › cancelPro": "no input; cancels only the caller's own renewal: below",
  "budgets.ts › saveBudget": "budget and category ids: below",
  "budgets.ts › removeBudget": "a budget id: below",
  "categories.ts › saveCategory": "a category id: below",
  "categories.ts › categoryAction": "a category id: below",
  "chat.ts › askMoney": "text only; its tools read the caller's own records (tests/db/chat-tools.test.ts)",
  "entry-form.ts › getEntryFormData": "no input; the caller's own wallets and categories (tests/integration)",
  "goals.ts › saveGoal": "a goal id: below",
  "goals.ts › saveContribution": "a goal id: below",
  "goals.ts › goalAction": "a goal id: below",
  "insights.ts › writeInsight": "no ids; the report is built from the caller's own records: below",
  "recurring.ts › saveRule": "recurring item, wallet and category ids: below",
  "recurring.ts › ruleAction": "a recurring item id: below",
  "recurring.ts › confirmDue": "a recurring item id: below",
  "recurring.ts › subscriptionSuggestionAction": "a merchant key: below",
  "settings.ts › savePreferences": "no ids; the caller's own settings",
  "settings.ts › completeWelcome": "no ids; the caller's own settings",
  "settings.ts › setAiEnabled": "no ids; the caller's own settings",
  "setup.ts › parseSetupAnswer": "text only; matched against the caller's own categories",
  "setup.ts › applySetupAction": "category ids: below",
  "transactions.ts › saveTransaction": "entry, wallet and category ids: below",
  "transactions.ts › removeTransaction": "an entry id: below",
  "wallets.ts › saveWallet": "a wallet id: below",
  "wallets.ts › walletAction": "a wallet id: below",
};

describe("every server action is reviewed for other users' records", () => {
  it("so a new one fails until it's on the list", async () => {
    const found: string[] = [];
    for (const [path, load] of Object.entries(modules)) {
      for (const [name, fn] of Object.entries(await load()))
        if (typeof fn === "function") found.push(`${path} › ${name}`);
    }
    expect(found.sort()).toEqual(Object.keys(REVIEWED).sort());
  });
});

describe("every server action refuses when nobody is signed in", () => {
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
  const { confirmDue, ruleAction, saveRule, subscriptionSuggestionAction } = await import("@/server/actions/recurring");
  const { removeBudget, saveBudget } = await import("@/server/actions/budgets");
  const { removeTransaction, saveTransaction } = await import("@/server/actions/transactions");
  const { dismissAlert } = await import("@/server/actions/alerts");
  const { applySetupAction } = await import("@/server/actions/setup");
  const { cancelPro, checkPaymentStatus, confirmCheckout, startCheckout } = await import("@/server/actions/billing");
  const { listSubscriptionSuggestions } = await import("@/server/services/recurring");
  const { buildInsightFacts } = await import("@/server/services/insight-facts");

  let alice: typeof schema.user.$inferSelect;
  let aliceCash: string;
  let aliceGroceries: string;
  const bob = { walletId: "", categoryId: "", goalId: "", ruleId: "", budgetId: "", transactionId: "" };
  let bobId: string;
  const bobsAlert = () => `budget:${bob.budgetId}:${monthOf(today)}:over`;
  /** A setup plan with nothing in it apart from what a test adds. */
  const setupPlan = (parts: Record<string, unknown>) => ({
    wallets: [],
    incomes: [],
    bills: [],
    goals: [],
    incomeWallet: "",
    billsWallet: "",
    limit: "",
    categoryBudgets: [],
    ...parts,
  });

  /** Everything Bob owns, to compare before and after Alice's attempts. */
  const bobsRows = async () => ({
    wallets: await db.select().from(schema.wallet).where(eq(schema.wallet.userId, bobId)),
    categories: await db.select().from(schema.category).where(eq(schema.category.userId, bobId)),
    goals: await db.select().from(schema.goal).where(eq(schema.goal.userId, bobId)),
    contributions: await db
      .select()
      .from(schema.goalContribution)
      .where(eq(schema.goalContribution.goalId, bob.goalId)),
    rules: await db.select().from(schema.recurringRule).where(eq(schema.recurringRule.userId, bobId)),
    budgets: await db.select().from(schema.budget).where(eq(schema.budget.userId, bobId)),
    transactions: await db.select().from(schema.transaction).where(eq(schema.transaction.userId, bobId)),
    dismissals: await db.select().from(schema.alertDismissal).where(eq(schema.alertDismissal.userId, bobId)),
    subscriptions: await db.select().from(schema.subscription).where(eq(schema.subscription.userId, bobId)),
    user: await db.select().from(schema.user).where(eq(schema.user.id, bobId)),
  });

  beforeAll(async () => {
    alice = await newUser("Alice");
    const bobUser = await newUser("Bob");
    bobId = bobUser.id;
    // Bob's records are made through the same actions, as Bob.
    session.user = bobUser;
    const ok = (r: unknown) => expect(r).toEqual({ ok: true });
    ok(
      await saveWallet(undefined, form({ name: "Bob's bank", kind: "bank", color: "#3f9b74", openingBalance: "1000" })),
    );
    ok(await saveCategory(undefined, form({ name: "Bob's pets", kind: "expense", icon: "tag", color: "#3f9b74" })));
    ok(await saveGoal(undefined, form({ name: "Bob's bike", target: "5000", icon: "tag", color: "#3f9b74" })));
    const [bobBank] = await db.select().from(schema.wallet).where(eq(schema.wallet.name, "Bob's bank"));
    const [bobPets] = await db.select().from(schema.category).where(eq(schema.category.name, "Bob's pets"));
    const [bobBike] = await db.select().from(schema.goal).where(eq(schema.goal.userId, bobId));
    ok(
      await saveContribution(
        undefined,
        form({ goalId: bobBike.id, direction: "add", amount: "500", occurredOn: today }),
      ),
    );
    ok(
      await saveRule(
        undefined,
        form({
          type: "expense",
          amount: "300",
          description: "Bob's rent",
          walletId: bobBank.id,
          categoryId: bobPets.id,
          repeat: "monthly-1",
          anchorDate: today,
          mode: "confirm",
        }),
      ),
    );
    ok(await saveBudget(undefined, form({ categoryId: bobPets.id, amount: "2000" })));
    ok(
      await saveTransaction(
        undefined,
        form({
          type: "expense",
          amount: "120",
          occurredOn: today,
          description: "Bob's lunch",
          walletId: bobBank.id,
          categoryId: bobPets.id,
        }),
      ),
    );
    const [rule] = await db.select().from(schema.recurringRule).where(eq(schema.recurringRule.userId, bobId));
    const [bud] = await db.select().from(schema.budget).where(eq(schema.budget.userId, bobId));
    const [tx] = await db.select().from(schema.transaction).where(eq(schema.transaction.description, "Bob's lunch"));
    Object.assign(bob, {
      walletId: bobBank.id,
      categoryId: bobPets.id,
      goalId: bobBike.id,
      ruleId: rule.id,
      budgetId: bud.id,
      transactionId: tx.id,
    });
    // A charge every month, which the app suggests tracking as a subscription.
    for (const daysAgo of [60, 30, 0]) {
      ok(
        await saveTransaction(
          undefined,
          form({
            type: "expense",
            amount: "649",
            occurredOn: addDays(today, -daysAgo),
            description: "Netflix",
            walletId: bobBank.id,
          }),
        ),
      );
    }
    ok(await dismissAlert(bobsAlert()));
    // Checkouts go through Razorpay, so Bob's are stored directly: one started,
    // one paid and being confirmed, one active.
    await db.insert(schema.subscription).values([
      { userId: bobId, razorpaySubscriptionId: "sub_bob_started", planKey: "monthly", status: "created" },
      { userId: bobId, razorpaySubscriptionId: "sub_bob_paid", planKey: "yearly", status: "authenticated" },
      {
        userId: bobId,
        razorpaySubscriptionId: "sub_bob_pro",
        planKey: "monthly",
        status: "active",
        currentStart: new Date(Date.UTC(2026, 9, 1)),
        currentEnd: new Date(Date.UTC(2099, 0, 1)),
      },
    ]);

    const [cash] = await db.select().from(schema.wallet).where(eq(schema.wallet.userId, alice.id));
    const [groceries] = await db.select().from(schema.category).where(eq(schema.category.userId, alice.id));
    aliceCash = cash.id;
    aliceGroceries = groceries.id;
  });

  it("refuses every id that belongs to Bob, as if it didn't exist, and changes nothing of his", async () => {
    session.user = alice;
    const before = await bobsRows();
    const attempts: [string, () => Promise<unknown>][] = [
      [
        "edit Bob's wallet",
        () =>
          saveWallet(
            undefined,
            form({ id: bob.walletId, name: "Mine now", kind: "bank", color: "#3f9b74", openingBalance: "0" }),
          ),
      ],
      ...(["archive", "restore", "delete", "makeDefault"] as const).map((op): [string, () => Promise<unknown>] => [
        `${op} Bob's wallet`,
        () => walletAction(op, bob.walletId),
      ]),
      [
        "edit Bob's category",
        () => saveCategory(undefined, form({ id: bob.categoryId, name: "Mine now", icon: "tag", color: "#3f9b74" })),
      ],
      ...(["archive", "restore", "delete"] as const).map((op): [string, () => Promise<unknown>] => [
        `${op} Bob's category`,
        () => categoryAction(op, bob.categoryId),
      ]),
      [
        "edit Bob's goal",
        () =>
          saveGoal(undefined, form({ id: bob.goalId, name: "Mine now", target: "1", icon: "tag", color: "#3f9b74" })),
      ],
      [
        "withdraw from Bob's goal",
        () =>
          saveContribution(
            undefined,
            form({ goalId: bob.goalId, direction: "withdraw", amount: "500", occurredOn: today }),
          ),
      ],
      ...(["archive", "restore", "delete"] as const).map((op): [string, () => Promise<unknown>] => [
        `${op} Bob's goal`,
        () => goalAction(op, bob.goalId),
      ]),
      [
        "edit Bob's recurring item",
        () =>
          saveRule(
            undefined,
            form({
              id: bob.ruleId,
              type: "expense",
              amount: "1",
              description: "Mine now",
              walletId: aliceCash,
              repeat: "monthly-1",
              anchorDate: today,
              mode: "confirm",
            }),
          ),
      ],
      ...(["pause", "resume", "delete", "skip"] as const).map((op): [string, () => Promise<unknown>] => [
        `${op} Bob's recurring item`,
        () => ruleAction(op, bob.ruleId),
      ]),
      [
        "record Bob's recurring item",
        () => confirmDue(undefined, form({ ruleId: bob.ruleId, amount: "300", occurredOn: today })),
      ],
      [
        "edit Bob's budget",
        () => saveBudget(undefined, form({ id: bob.budgetId, categoryId: aliceGroceries, amount: "1" })),
      ],
      ["remove Bob's budget", () => removeBudget(bob.budgetId)],
      ["budget on Bob's category", () => saveBudget(undefined, form({ categoryId: bob.categoryId, amount: "1" }))],
      [
        "edit Bob's entry",
        () =>
          saveTransaction(
            undefined,
            form({
              id: bob.transactionId,
              type: "expense",
              amount: "1",
              occurredOn: today,
              description: "Mine now",
              walletId: aliceCash,
            }),
          ),
      ],
      ["delete Bob's entry", () => removeTransaction(bob.transactionId)],
      [
        "spend from Bob's wallet",
        () =>
          saveTransaction(
            undefined,
            form({ type: "expense", amount: "1", occurredOn: today, description: "x", walletId: bob.walletId }),
          ),
      ],
      [
        "move money into Bob's wallet",
        () =>
          saveTransaction(
            undefined,
            form({
              type: "transfer",
              amount: "1",
              occurredOn: today,
              description: "x",
              walletId: aliceCash,
              toWalletId: bob.walletId,
            }),
          ),
      ],
      [
        "file an entry under Bob's category",
        () =>
          saveTransaction(
            undefined,
            form({
              type: "expense",
              amount: "1",
              occurredOn: today,
              description: "x",
              walletId: aliceCash,
              categoryId: bob.categoryId,
            }),
          ),
      ],
      [
        "recurring item on Bob's wallet",
        () =>
          saveRule(
            undefined,
            form({
              type: "expense",
              amount: "1",
              description: "x",
              walletId: bob.walletId,
              repeat: "monthly-1",
              anchorDate: today,
              mode: "confirm",
            }),
          ),
      ],
      [
        "bill under Bob's category in setup",
        () =>
          applySetupAction(
            setupPlan({ bills: [{ name: "x", amount: "1", subscription: false, categoryId: bob.categoryId }] }),
          ),
      ],
      [
        "budget on Bob's category in setup",
        () => applySetupAction(setupPlan({ categoryBudgets: [{ categoryId: bob.categoryId, amount: "1" }] })),
      ],
    ];

    for (const [what, attempt] of attempts) {
      const result = await attempt();
      // The refusal must be the ownership check ("doesn't exist"), not a form error that hides it.
      expect(JSON.stringify(result), what).toMatch(/"ok":false.*doesn't exist/);
    }
    expect(await bobsRows()).toEqual(before);
  });

  it("keeps alert and subscription choices to Alice's own lists", async () => {
    session.user = alice;
    const before = await bobsRows();
    // A key with Bob's budget id is only hidden for Alice; Bob still sees his alert.
    expect(await dismissAlert(bobsAlert())).toEqual({ ok: true });
    expect(
      await db.$count(
        schema.alertDismissal,
        and(eq(schema.alertDismissal.userId, alice.id), eq(schema.alertDismissal.alertKey, bobsAlert())),
      ),
    ).toBe(1);
    expect(await subscriptionSuggestionAction("track", "netflix")).toEqual({
      ok: false,
      error: "That suggestion is no longer available.",
    });
    expect(await subscriptionSuggestionAction("dismiss", "netflix")).toEqual({ ok: true });
    expect(await bobsRows()).toEqual(before);
    expect((await listSubscriptionSuggestions(db, bobId, today)).map((s) => s.merchantKey)).toEqual(["netflix"]);
  });

  it("only checks out, confirms, syncs or cancels Alice's own subscriptions", async () => {
    session.user = alice;
    for (const [k, v] of Object.entries({
      RAZORPAY_KEY_ID: "rzp_test",
      RAZORPAY_KEY_SECRET: "key_secret",
      RAZORPAY_PLAN_MONTHLY: "plan_m",
      RAZORPAY_PLAN_YEARLY: "plan_y",
    }))
      vi.stubEnv(k, v);
    const before = await bobsRows();
    vi.mocked(razorpay.createSubscription).mockResolvedValueOnce({
      id: "sub_alice",
      plan_id: "plan_m",
      status: "created",
      current_start: null,
      current_end: null,
      ended_at: null,
      notes: { userId: alice.id, interval: "monthly" },
    });
    // Bob's started checkout isn't handed to Alice: she gets a new one in her name.
    expect(await startCheckout("monthly")).toMatchObject({ ok: true, subscriptionId: "sub_alice" });
    expect(razorpay.createSubscription).toHaveBeenCalledWith(expect.anything(), "monthly", alice.id);
    // Bob's payment, correctly signed, confirms nothing for Alice.
    const signature = createHmac("sha256", "key_secret").update("pay_bob|sub_bob_paid").digest("hex");
    expect(
      await confirmCheckout({
        razorpay_payment_id: "pay_bob",
        razorpay_subscription_id: "sub_bob_paid",
        razorpay_signature: signature,
      }),
    ).toMatchObject({ ok: false, error: expect.stringContaining("couldn't confirm") });
    expect(await checkPaymentStatus()).toBe(false);
    expect(await cancelPro()).toEqual({ ok: false, error: "There's no renewal to cancel." });
    // Razorpay was never asked about Bob's subscriptions, and none of them changed.
    expect(razorpay.fetchSubscription).not.toHaveBeenCalled();
    expect(razorpay.cancelSubscriptionAtCycleEnd).not.toHaveBeenCalled();
    expect(await bobsRows()).toEqual(before);
  });

  it("builds Alice's report from her own records only", async () => {
    // writeInsight passes only the session's user id to this; the model call isn't needed to check it.
    session.user = alice;
    expect(
      await saveTransaction(
        undefined,
        form({ type: "expense", amount: "40", occurredOn: today, description: "Alice's tea", walletId: aliceCash }),
      ),
    ).toEqual({ ok: true });
    for (const kind of ["so_far", "month"] as const) {
      const month = kind === "so_far" ? monthOf(today) : addMonths(monthOf(today), -1);
      const facts = await buildInsightFacts(db, alice.id, { kind, month, today, currency: "INR" });
      expect(JSON.stringify(facts), kind).not.toMatch(/Bob|Netflix/);
    }
    const facts = await buildInsightFacts(db, alice.id, {
      kind: "so_far",
      month: monthOf(today),
      today,
      currency: "INR",
    });
    expect(facts).toMatchObject({ entries: 1, spending: formatMoney(40_00, "INR", { trimWhole: true }) });
  });

  it("ignores ownership fields a request slips in (mass assignment)", async () => {
    session.user = alice;
    const sneaky = form({
      type: "expense",
      amount: "75",
      occurredOn: today,
      description: "Sneaky",
      walletId: aliceCash,
      userId: bobId,
      source: "recurring",
      recurringRuleId: bob.ruleId,
    });
    expect(await saveTransaction(undefined, sneaky)).toEqual({ ok: true });
    const [row] = await db.select().from(schema.transaction).where(eq(schema.transaction.description, "Sneaky"));
    expect(row).toMatchObject({ userId: alice.id, source: "manual", recurringRuleId: null });
  });
});
