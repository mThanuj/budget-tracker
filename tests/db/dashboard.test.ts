// The home page's data in few queries (C1): it runs on every visit (no static
// shells since D-027) and again after every save.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedNewUser } from "@/server/db/seed-defaults";
import { createBudget } from "@/server/services/budgets";
import { loadDashboard } from "@/server/services/dashboard";
import { createGoal } from "@/server/services/goals";
import { createRule } from "@/server/services/recurring";
import { createTransaction } from "@/server/services/transactions";
import { listWallets } from "@/server/services/wallets";
import { createTestDb, createTestUser } from "./helpers";

const queries: string[] = [];
let counting = false;
let t: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;
const today = "2026-10-15";

beforeAll(async () => {
  t = await createTestDb({ logger: { logQuery: (q) => counting && queries.push(q) } });
  const u = await createTestUser(t.db);
  await seedNewUser(t.db, u.id);
  userId = u.id;
  const [cash] = await listWallets(t.db, u.id);
  const rule = (description: string, amount: number, anchorDate: string, mode: "auto" | "confirm") =>
    createRule(
      t.db,
      u.id,
      {
        type: "expense",
        amount,
        description,
        walletId: cash.id,
        toWalletId: null,
        categoryId: null,
        frequency: "monthly",
        interval: 1,
        anchorDate,
        endDate: null,
        mode,
        isSubscription: false,
      },
      today,
    );
  await rule("Rent", 12_000_00, "2026-10-28", "auto"); // later this month
  await rule("Electricity", 900_00, today, "confirm"); // due today, waiting
  await createBudget(t.db, u.id, { categoryId: null, amount: 30_000_00, rollover: false }, "2026-10");
  await createGoal(t.db, u.id, { name: "Bike", target: 50_000_00, targetDate: null, icon: "tag", color: "#4a7fc1" });
  for (const [occurredOn, amount] of [
    ["2026-10-02", 2_000_00],
    ["2026-10-10", 500_00],
    ["2026-09-05", 1_000_00],
  ] as const) {
    await createTransaction(t.db, u.id, {
      type: "expense",
      amount,
      occurredOn,
      description: "Shopping",
      notes: null,
      walletId: cash.id,
      toWalletId: null,
      categoryId: null,
    });
  }
});
afterAll(() => t.close());

describe("the home page's data (loadDashboard)", () => {
  it("takes at most 11 queries, reading the recurring items once", async () => {
    queries.length = 0;
    counting = true;
    const d = await loadDashboard(t.db, userId, { today, currency: "INR" });
    counting = false;

    expect(queries.length).toBeLessThanOrEqual(11);
    expect(queries.filter((q) => /from "recurring_rule"/.test(q))).toHaveLength(1);

    // …and still the same figures.
    expect(d.thisMonth).toMatchObject({ month: "2026-10", expenseMinor: 2_500_00 });
    expect(d.waiting.map((w) => w.rule.description)).toEqual(["Electricity"]);
    expect(d.upcoming.map((u) => u.rule.description)).toEqual(["Rent"]);
    expect(d.billsLeft).toBe(12_000_00 + 900_00);
    expect(d.overview.overall?.remainingMinor).toBe(30_000_00 - 2_500_00);
  });
});
