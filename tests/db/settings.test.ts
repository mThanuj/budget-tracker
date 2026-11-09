// A set-up account's currency is fixed, because amounts are saved in its
// smallest unit (business rules). These check what counts as saved amounts,
// and which categories can be the main income (Insights' pay months).
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/server/db/schema";
import { seedNewUser } from "@/server/db/seed-defaults";
import { createBudget } from "@/server/services/budgets";
import { archiveCategory, deleteCategory, listCategories } from "@/server/services/categories";
import { UserError } from "@/server/services/errors";
import { createGoal } from "@/server/services/goals";
import { createRule } from "@/server/services/recurring";
import { CURRENCY_LOCKED, hasSavedAmounts, updateMainIncome, updatePreferences } from "@/server/services/settings";
import { createTransaction } from "@/server/services/transactions";
import { listWallets } from "@/server/services/wallets";
import { createTestDb, createTestUser } from "./helpers";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

const today = "2026-10-25";
async function freshUser(overrides: Partial<typeof schema.user.$inferInsert> = {}) {
  const u = await createTestUser(t.db, overrides);
  await seedNewUser(t.db, u.id); // default categories and an empty Cash wallet
  const [cash] = await listWallets(t.db, u.id);
  return { id: u.id, cashId: cash.id };
}
const refusal = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (err: unknown) => (err instanceof UserError ? err.message : err),
  );

describe("saved amounts (hasSavedAmounts)", () => {
  it("are none for a new account: an empty wallet doesn't count", async () => {
    const u = await freshUser();
    expect(await hasSavedAmounts(t.db, u.id)).toBe(false);
  });

  it("count each kind of amount on its own", async () => {
    const withEntry = await freshUser();
    await createTransaction(t.db, withEntry.id, {
      type: "expense",
      amount: 240_00,
      occurredOn: today,
      description: "Chai",
      notes: null,
      walletId: withEntry.cashId,
      toWalletId: null,
      categoryId: null,
    });
    const withBalance = await freshUser();
    await t.db
      .update(schema.wallet)
      .set({ openingBalanceMinor: 500_00 })
      .where(eq(schema.wallet.id, withBalance.cashId));
    const withBudget = await freshUser();
    await createBudget(t.db, withBudget.id, { categoryId: null, amount: 10_000_00, rollover: false }, "2026-10");
    const withGoal = await freshUser();
    await createGoal(t.db, withGoal.id, {
      name: "Bike",
      target: 5_000_00,
      targetDate: null,
      icon: "tag",
      color: "#4a7fc1",
    });
    const withRule = await freshUser();
    await createRule(
      t.db,
      withRule.id,
      {
        type: "expense",
        amount: 300_00,
        description: "Rent",
        walletId: withRule.cashId,
        toWalletId: null,
        categoryId: null,
        frequency: "monthly",
        interval: 1,
        anchorDate: "2026-11-01",
        endDate: null,
        mode: "confirm",
        isSubscription: false,
      },
      today,
    );
    for (const u of [withEntry, withBalance, withBudget, withGoal, withRule]) {
      expect(await hasSavedAmounts(t.db, u.id)).toBe(true);
    }
  });
});

describe("changing currency (updatePreferences)", () => {
  it("is refused once the account is set up; the time zone still changes", async () => {
    const u = await freshUser({ onboardedAt: new Date() });
    expect(await refusal(updatePreferences(t.db, u.id, { currency: "USD", timezone: "UTC" }))).toBe(CURRENCY_LOCKED);
    await updatePreferences(t.db, u.id, { currency: "INR", timezone: "UTC" });
    const [row] = await t.db.select().from(schema.user).where(eq(schema.user.id, u.id));
    expect(row).toMatchObject({ currency: "INR", timezone: "UTC" });
  });

  it("while setting up: any currency with nothing saved, the same decimals once something is", async () => {
    const empty = await freshUser();
    await updatePreferences(t.db, empty.id, { currency: "JPY", timezone: "Asia/Tokyo" }, { onboarding: true });
    const [done] = await t.db.select().from(schema.user).where(eq(schema.user.id, empty.id));
    expect(done.currency).toBe("JPY");
    expect(done.onboardedAt).not.toBeNull();
    // Set up now: the welcome screen can't be used to change it again.
    expect(
      await refusal(
        updatePreferences(t.db, empty.id, { currency: "INR", timezone: "Asia/Tokyo" }, { onboarding: true }),
      ),
    ).toBe(CURRENCY_LOCKED);

    const early = await freshUser();
    await t.db.update(schema.wallet).set({ openingBalanceMinor: 500_00 }).where(eq(schema.wallet.id, early.cashId));
    expect(
      await refusal(
        updatePreferences(t.db, early.id, { currency: "JPY", timezone: "Asia/Kolkata" }, { onboarding: true }),
      ),
    ).toMatch(/^JPY has no decimal places and INR has 2 decimal places/);
    expect(
      await refusal(
        updatePreferences(t.db, early.id, { currency: "KWD", timezone: "Asia/Kolkata" }, { onboarding: true }),
      ),
    ).toMatch(/^KWD has 3 decimal places/);
    await updatePreferences(t.db, early.id, { currency: "USD", timezone: "Asia/Kolkata" }, { onboarding: true });
    const [row] = await t.db.select().from(schema.user).where(eq(schema.user.id, early.id));
    expect(row.currency).toBe("USD");
  });
});

describe("main income (updateMainIncome)", () => {
  const mainIncomeOf = async (userId: string) =>
    (await t.db.select().from(schema.user).where(eq(schema.user.id, userId)))[0].mainIncomeCategoryId;
  const categoryNamed = async (userId: string, name: string) =>
    (await listCategories(t.db, userId)).find((c) => c.name === name)!.id;

  it("is one of the user's own active income categories, or none", async () => {
    const u = await freshUser();
    const other = await freshUser();
    const salary = await categoryNamed(u.id, "Salary");
    await updateMainIncome(t.db, u.id, salary);
    expect(await mainIncomeOf(u.id)).toBe(salary);

    expect(await refusal(updateMainIncome(t.db, u.id, await categoryNamed(u.id, "Groceries")))).toBe(
      "Choose an income category.",
    );
    expect(await refusal(updateMainIncome(t.db, u.id, await categoryNamed(other.id, "Salary")))).toBe(
      "That category doesn't exist.",
    );
    const freelance = await categoryNamed(u.id, "Freelance");
    await archiveCategory(t.db, u.id, freelance);
    expect(await refusal(updateMainIncome(t.db, u.id, freelance))).toBe("Restore this category before choosing it.");
    expect(await mainIncomeOf(u.id)).toBe(salary);

    await updateMainIncome(t.db, u.id, null);
    expect(await mainIncomeOf(u.id)).toBeNull();
  });

  it("goes back to calendar months when its category is archived or deleted", async () => {
    const u = await freshUser();
    const salary = await categoryNamed(u.id, "Salary");
    await updateMainIncome(t.db, u.id, salary);
    await archiveCategory(t.db, u.id, salary);
    expect(await mainIncomeOf(u.id)).toBeNull();

    const gifts = await categoryNamed(u.id, "Gifts Received");
    await updateMainIncome(t.db, u.id, gifts);
    await deleteCategory(t.db, u.id, gifts); // no entries, so it can be deleted
    expect(await mainIncomeOf(u.id)).toBeNull();
  });
});
