// Server actions are public endpoints: anyone can call them with any
// arguments. These run the real actions against an in-memory Postgres (PGlite);
// only the session, Next's cache/headers and Better Auth are stand-ins.
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/server/db/schema";

const session = vi.hoisted(() => ({ user: null as null | typeof import("@/server/db/schema").user.$inferSelect }));
const cookieJar = vi.hoisted(() => ({ deleted: [] as string[] }));

vi.mock("@/server/db", async () => {
  const { createTestDb } = await import("../db/helpers");
  return { db: (await createTestDb()).db };
});
// Like the real requireUser: no session means Next's redirect to the landing page.
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
  cookies: vi.fn(async () => ({
    getAll: () => [{ name: "better-auth.session_token" }, { name: "theme" }],
    delete: (name: string) => cookieJar.deleted.push(name),
  })),
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
const { listWallets } = await import("@/server/services/wallets");
const { listCategories } = await import("@/server/services/categories");
const { createTransaction } = await import("@/server/services/transactions");
const razorpay = await import("@/server/billing/razorpay");
const { getUserPlan } = await import("@/server/billing/plan");

/** A signed-in user with the default categories and a Cash wallet. */
async function newUser(name: string) {
  const row = await createTestUser(db, { name, onboardedAt: new Date() });
  await seedNewUser(db, row.id);
  const [fresh] = await db.select().from(schema.user).where(eq(schema.user.id, row.id));
  const [cash] = await listWallets(db, row.id);
  const groceries = (await listCategories(db, row.id)).find((c) => c.name === "Groceries")!;
  return { user: fresh, cashId: cash.id, groceriesId: groceries.id };
}
const signInAs = (u: { user: typeof schema.user.$inferSelect } | null) => {
  session.user = u?.user ?? null;
};
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
};
const isRedirect = (err: unknown) => err instanceof Error && "digest" in err && String(err.digest).startsWith("NEXT_REDIRECT");

let alice: Awaited<ReturnType<typeof newUser>>;
let bob: Awaited<ReturnType<typeof newUser>>;

beforeAll(async () => {
  alice = await newUser("Alice");
  bob = await newUser("Bob");
});
beforeEach(() => {
  signInAs(alice);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

// The "every action needs a session" sweep lives in tests/security/access-control.test.ts.

describe("entries (saveTransaction / removeTransaction)", async () => {
  const { removeTransaction, saveTransaction } = await import("@/server/actions/transactions");
  const entry = (over: Record<string, string> = {}) =>
    form({ type: "expense", amount: "240", occurredOn: "2026-10-20", description: "Chai", walletId: alice.cashId, categoryId: alice.groceriesId, ...over });

  it("saves an entry for the signed-in user", async () => {
    expect(await saveTransaction(undefined, entry({ description: "Chai and samosa" }))).toEqual({ ok: true });
    const rows = await db.select().from(schema.transaction).where(eq(schema.transaction.description, "Chai and samosa"));
    expect(rows).toEqual([expect.objectContaining({ userId: alice.user.id, amountMinor: 240_00 })]);
  });

  it("explains a bad amount instead of saving", async () => {
    expect(await saveTransaction(undefined, entry({ amount: "" }))).toEqual({ ok: false, fieldErrors: { amount: expect.any(String) } });
    expect(await saveTransaction(undefined, entry({ amount: "-5" }))).toMatchObject({ ok: false, fieldErrors: { amount: expect.any(String) } });
  });

  it("won't use someone else's wallet or category", async () => {
    expect(await saveTransaction(undefined, entry({ walletId: bob.cashId }))).toEqual({ ok: false, fieldErrors: { walletId: "That wallet doesn't exist." } });
    expect(await saveTransaction(undefined, entry({ categoryId: bob.groceriesId }))).toMatchObject({ ok: false, fieldErrors: { categoryId: expect.any(String) } });
  });

  it("won't delete someone else's entry", async () => {
    const theirs = await createTransaction(db, bob.user.id, {
      type: "expense", amount: 99_00, occurredOn: "2026-10-20", description: "Bob's", notes: null, walletId: bob.cashId, toWalletId: null, categoryId: null,
    });
    expect(await removeTransaction(theirs.id)).toEqual({ ok: false, error: "That entry doesn't exist." });
    expect(await db.$count(schema.transaction, eq(schema.transaction.id, theirs.id))).toBe(1);
  });

  it("rejects a malformed id as a validation failure", async () => {
    expect(await removeTransaction("not-a-uuid")).toMatchObject({ ok: false, fieldErrors: expect.any(Object) });
  });
});

describe("wallets (walletAction)", async () => {
  const { walletAction } = await import("@/server/actions/wallets");

  it("rejects operations that aren't on the list, including inherited names", async () => {
    for (const op of ["toString", "constructor", "nuke"]) {
      await expect(Reflect.apply(walletAction, null, [op, alice.cashId])).rejects.toThrow(/Unknown wallet operation/);
    }
    const [cash] = await listWallets(db, alice.user.id);
    expect(cash.archivedAt).toBeNull(); // nothing happened
  });

  it("won't archive someone else's wallet", async () => {
    expect(await walletAction("archive", bob.cashId)).toMatchObject({ ok: false });
    const [theirs] = await listWallets(db, bob.user.id);
    expect(theirs.archivedAt).toBeNull();
  });
});

describe("alerts (dismissAlert)", async () => {
  const { dismissAlert } = await import("@/server/actions/alerts");

  it("only accepts alert keys in the expected shape", async () => {
    expect(await dismissAlert("'; drop table alert_dismissal; --")).toMatchObject({ ok: false });
    const key = `budget:${alice.groceriesId}:2026-10:80`;
    expect(await dismissAlert(key)).toEqual({ ok: true });
    expect(await db.$count(schema.alertDismissal, eq(schema.alertDismissal.alertKey, key))).toBe(1);
  });
});

describe("budgets, goals and recurring items", async () => {
  const { saveBudget } = await import("@/server/actions/budgets");
  const { goalAction, saveGoal } = await import("@/server/actions/goals");
  const { ruleAction, subscriptionSuggestionAction } = await import("@/server/actions/recurring");

  it("saves a budget, but not on someone else's category", async () => {
    expect(await saveBudget(undefined, form({ categoryId: alice.groceriesId, amount: "5000" }))).toEqual({ ok: true });
    expect(await saveBudget(undefined, form({ categoryId: bob.groceriesId, amount: "5000" }))).toEqual({
      ok: false, fieldErrors: { categoryId: "That category doesn't exist." },
    });
    expect(await saveBudget(undefined, form({ categoryId: alice.groceriesId, amount: "lots" }))).toMatchObject({ ok: false, fieldErrors: { amount: expect.any(String) } });
  });

  it("explains a goal without a name or target", async () => {
    expect(await saveGoal(undefined, form({ name: "", target: "" }))).toMatchObject({
      ok: false, fieldErrors: { name: expect.any(String), target: expect.any(String) },
    });
  });

  it("rejects goal and recurring operations that aren't on the list", async () => {
    const id = crypto.randomUUID();
    await expect(Reflect.apply(goalAction, null, ["toString", id])).rejects.toThrow(/Unknown goal operation/);
    await expect(Reflect.apply(ruleAction, null, ["explode", id])).rejects.toThrow(/Unknown rule operation/);
    expect(await subscriptionSuggestionAction("track", "Robert'); DROP TABLE")).toMatchObject({ ok: false });
  });
});

describe("Pro checkout (billing actions)", async () => {
  const { cancelPro, confirmCheckout, startCheckout } = await import("@/server/actions/billing");
  const configure = () => {
    for (const [k, v] of Object.entries({
      RAZORPAY_KEY_ID: "rzp_test", RAZORPAY_KEY_SECRET: "key_secret", RAZORPAY_WEBHOOK_SECRET: "whsec",
      RAZORPAY_PLAN_MONTHLY: "plan_m", RAZORPAY_PLAN_YEARLY: "plan_y",
    })) vi.stubEnv(k, v);
  };
  const paid = (subscriptionId: string, paymentId = "pay_1") => ({
    razorpay_payment_id: paymentId,
    razorpay_subscription_id: subscriptionId,
    razorpay_signature: createHmac("sha256", "key_secret").update(`${paymentId}|${subscriptionId}`).digest("hex"),
  });

  it("says Pro isn't available while payments aren't set up", async () => {
    expect(await startCheckout("monthly")).toEqual({ ok: false, error: "Pro isn't available yet. Please check back soon." });
    expect(razorpay.createSubscription).not.toHaveBeenCalled();
  });

  it("refuses an interval that isn't monthly or yearly", async () => {
    configure();
    expect(await Reflect.apply(startCheckout, null, ["weekly"])).toEqual({ ok: false, error: "Choose monthly or yearly." });
  });

  it("explains, without details, when Razorpay can't be reached", async () => {
    configure();
    vi.mocked(razorpay.createSubscription).mockRejectedValueOnce(new Error("ECONNRESET"));
    expect(await startCheckout("yearly")).toEqual({ ok: false, error: "We couldn't reach the payment service. Try again in a minute." });
  });

  it("won't confirm a payment for someone else's subscription, even with a valid signature", async () => {
    configure();
    await db.insert(schema.subscription).values({ userId: bob.user.id, razorpaySubscriptionId: "sub_bob", planKey: "monthly", status: "created" });
    expect(await confirmCheckout(paid("sub_bob"))).toMatchObject({ ok: false, error: expect.stringContaining("couldn't confirm") });
    expect(await confirmCheckout({ ...paid("sub_bob"), razorpay_signature: "nope" })).toEqual({ ok: false, error: "That payment response looks incomplete." });
    expect(razorpay.fetchSubscription).not.toHaveBeenCalled();
    expect((await getUserPlan(db, alice.user.id)).id).toBe("free");
  });

  it("confirms a signed payment for the user's own checkout", async () => {
    configure();
    await db.insert(schema.subscription).values({ userId: alice.user.id, razorpaySubscriptionId: "sub_alice", planKey: "monthly", status: "created" });
    vi.mocked(razorpay.fetchSubscription).mockResolvedValueOnce({
      id: "sub_alice", plan_id: "plan_m", status: "active", current_start: Date.UTC(2026, 9, 24) / 1000,
      current_end: Date.UTC(2099, 0, 1) / 1000, ended_at: null, notes: { userId: alice.user.id, interval: "monthly" },
    });
    expect(await confirmCheckout(paid("sub_alice"))).toEqual({ ok: true, active: true });
    expect((await getUserPlan(db, alice.user.id)).id).toBe("pro");
    // ...and a second checkout is refused rather than charging twice.
    vi.mocked(razorpay.fetchSubscription).mockResolvedValue({
      id: "sub_alice", plan_id: "plan_m", status: "active", current_start: Date.UTC(2026, 9, 24) / 1000,
      current_end: Date.UTC(2099, 0, 1) / 1000, ended_at: null, notes: { userId: alice.user.id, interval: "monthly" },
    });
    expect(await startCheckout("monthly")).toEqual({ ok: false, error: "You already have Pro." });
    expect(razorpay.createSubscription).not.toHaveBeenCalled();
  });

  it("has nothing to cancel for a free user", async () => {
    configure();
    signInAs(bob);
    expect(await cancelPro()).toEqual({ ok: false, error: "There's no renewal to cancel." });
    expect(razorpay.cancelSubscriptionAtCycleEnd).not.toHaveBeenCalled();
  });
});

describe("insights and setup", async () => {
  const { writeInsight } = await import("@/server/actions/insights");
  const { applySetupAction } = await import("@/server/actions/setup");

  it("writes reports only for Pro, and only for known kinds", async () => {
    signInAs(bob); // free
    expect(await writeInsight("month")).toEqual({ ok: false, reason: "pro" });
    expect(await Reflect.apply(writeInsight, null, ["everything"])).toEqual({ ok: false, reason: "not_enough" });
  });

  it("refuses a setup plan that isn't the expected shape", async () => {
    expect(await applySetupAction({ wallets: "lots" })).toMatchObject({ ok: false, fieldErrors: expect.any(Object) });
    expect(await applySetupAction(null)).toMatchObject({ ok: false });
  });
});

describe("settings", async () => {
  const { savePreferences, setAiEnabled } = await import("@/server/actions/settings");

  it("stores AI on only for a real true, whatever the client sends", async () => {
    await Reflect.apply(setAiEnabled, null, ["yes"]);
    const [row] = await db.select().from(schema.user).where(eq(schema.user.id, alice.user.id));
    expect(row.aiEnabled).toBe(false);
    await setAiEnabled(true);
    const [after] = await db.select().from(schema.user).where(eq(schema.user.id, alice.user.id));
    expect(after.aiEnabled).toBe(true);
  });

  it("refuses an unknown currency or time zone", async () => {
    expect(await savePreferences(undefined, form({ currency: "XYZ", timezone: "Asia/Kolkata" }))).toMatchObject({ error: expect.any(String) });
    expect(await savePreferences(undefined, form({ currency: "INR", timezone: "Mars/Olympus" }))).toMatchObject({ error: expect.any(String) });
    expect(await savePreferences(undefined, new FormData())).toMatchObject({ error: expect.any(String) });
  });

  it("saves a currency and time zone from the lists", async () => {
    expect(await savePreferences(undefined, form({ currency: "USD", timezone: "America/New_York" }))).toEqual({ ok: true });
    const [row] = await db.select().from(schema.user).where(eq(schema.user.id, alice.user.id));
    expect(row).toMatchObject({ currency: "USD", timezone: "America/New_York" });
    await savePreferences(undefined, form({ currency: "INR", timezone: "Asia/Kolkata" }));
  });
});

describe("money chat (askMoney)", async () => {
  const { askMoney } = await import("@/server/actions/chat");

  it("rejects a conversation that doesn't end with a question", async () => {
    expect(await askMoney([{ role: "assistant", content: "Hi" }])).toMatchObject({ ok: false, reason: "invalid" });
    expect(await Reflect.apply(askMoney, null, ["not a list"])).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("says AI is unavailable when no provider is configured (never calls out)", async () => {
    expect(await askMoney([{ role: "user", content: "How much did I spend?" }])).toMatchObject({ ok: false, reason: "disabled" });
  });
});

describe("entry form data (getEntryFormData)", async () => {
  const { getEntryFormData } = await import("@/server/actions/entry-form");

  it("lists only the signed-in user's wallets and categories", async () => {
    const data = await getEntryFormData();
    expect(data.wallets.map((w) => w.id)).toContain(alice.cashId);
    expect(data.wallets.map((w) => w.id)).not.toContain(bob.cashId);
    expect(data.categories.map((c) => c.id)).not.toContain(bob.groceriesId);
  });
});

describe("signing out (signOut)", async () => {
  const { signOut } = await import("@/server/actions/account");
  const { auth } = await import("@/server/auth");

  it("ends the session through Better Auth and goes to the landing page", async () => {
    const outcome = await signOut().then(
      () => "returned",
      (err: unknown) => (isRedirect(err) && String((err as { digest: string }).digest).includes(";/;") ? "redirected home" : String(err)),
    );
    expect(outcome).toBe("redirected home");
    expect(auth.api.signOut).toHaveBeenCalledTimes(1);
    expect(await db.$count(schema.user, eq(schema.user.id, alice.user.id))).toBe(1); // the account stays
  });
});

describe("deleting the account (deleteAccount)", async () => {
  const { deleteAccount } = await import("@/server/actions/account");

  it("needs the word DELETE, and copes with input that isn't text", async () => {
    expect(await deleteAccount("please")).toEqual({ ok: false, error: "Type DELETE to confirm." });
    expect(await Reflect.apply(deleteAccount, null, [42])).toEqual({ ok: false, error: "Type DELETE to confirm." });
    expect(await db.$count(schema.user, eq(schema.user.id, alice.user.id))).toBe(1);
  });

  it("removes the account and its data, clears sign-in cookies, and redirects", async () => {
    const carol = await newUser("Carol");
    signInAs(carol);
    const outcome = await deleteAccount("delete").then(
      () => "returned",
      (err: unknown) => (isRedirect(err) ? "redirected" : String(err)),
    );
    expect(outcome).toBe("redirected");
    expect(await db.$count(schema.user, eq(schema.user.id, carol.user.id))).toBe(0);
    expect(await db.$count(schema.wallet, eq(schema.wallet.userId, carol.user.id))).toBe(0);
    expect(cookieJar.deleted).toEqual(["better-auth.session_token"]); // the theme cookie stays
    expect(await db.$count(schema.user, eq(schema.user.id, alice.user.id))).toBe(1); // nobody else
  });
});
