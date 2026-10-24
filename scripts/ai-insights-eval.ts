// Writes last month's report and a check-in for sample data with the real AI
// provider, on both models, so you can judge the wording after changing the
// model or the instructions:
//   pnpm ai:insights-eval
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { addDays, addMonths, monthOf, todayInTz } from "../src/lib/dates";
import { providerChain } from "../src/server/ai/config";
import { writeInsightWithModel } from "../src/server/ai/insights";
import { lanesFor } from "../src/server/ai/providers";
import type { Db } from "../src/server/db";
import * as schema from "../src/server/db/schema";
import { seedNewUser } from "../src/server/db/seed-defaults";
import { createBudget } from "../src/server/services/budgets";
import { listCategories } from "../src/server/services/categories";
import { addContribution, createGoal } from "../src/server/services/goals";
import { buildInsightFacts } from "../src/server/services/insight-facts";
import { createTransaction } from "../src/server/services/transactions";
import { createWallet, listWallets } from "../src/server/services/wallets";

async function seed(db: Db, userId: string, today: string) {
  await seedNewUser(db, userId);
  const [cash] = await listWallets(db, userId);
  const sbi = await createWallet(db, userId, { name: "SBI Savings", kind: "bank", color: "#4a7fc1", openingBalanceMinor: 25_000_00 });
  const c = Object.fromEntries((await listCategories(db, userId)).map((x) => [x.name, x.id]));
  const add = (type: "income" | "expense", amount: number, occurredOn: string, description: string, cat: string, walletId = sbi.id) =>
    createTransaction(db, userId, { type, amount, occurredOn, description, notes: null, walletId, toWalletId: null, categoryId: c[cat] ?? null });
  const thisMonth = monthOf(today);
  const last = addMonths(thisMonth, -1);
  const before = addMonths(thisMonth, -2);
  await createBudget(db, userId, { categoryId: null, amount: 30_000_00, rollover: false }, before);
  await createBudget(db, userId, { categoryId: c["Dining Out"], amount: 2_500_00, rollover: false }, before);
  for (const [m, groceries, dining, shopping] of [[before, 5_100_00, 1_900_00, 1_200_00], [last, 6_300_00, 3_350_00, 4_800_00]] as const) {
    await add("income", 42_000_00, `${m}-01`, "Salary", "Salary");
    await add("expense", 15_000_00, `${m}-05`, "Rent", "Rent & Housing");
    await add("expense", groceries, `${m}-09`, "Big Bazaar", "Groceries");
    await add("expense", dining, `${m}-15`, "Swiggy", "Dining Out", cash.id);
    await add("expense", shopping, `${m}-20`, "Myntra", "Shopping");
    await add("expense", 1_100_00, `${m}-12`, "Electricity", "Bills & Utilities");
  }
  await add("expense", 649_00, `${last}-22`, "Zomato", "Dining Out", cash.id);
  await add("expense", 649_00, `${last}-23`, "Zomato", "Dining Out", cash.id);
  await add("expense", 2_000_00, `${last}-26`, "ATM withdrawal", "");
  const trip = await createGoal(db, userId, { name: "Goa trip", target: 25_000_00, targetDate: `${addMonths(thisMonth, 4)}-15`, icon: "plane", color: "#2f8f9d" });
  await addContribution(db, userId, trip.id, { direction: "add", amount: 3_000_00, occurredOn: `${last}-02`, note: null });
  // This month so far.
  await add("income", 42_000_00, `${thisMonth}-01`, "Salary", "Salary");
  await add("expense", 15_000_00, `${thisMonth}-05`, "Rent", "Rent & Housing");
  await add("expense", 2_900_00, addDays(today, -6) > `${thisMonth}-01` ? addDays(today, -6) : today, "Big Bazaar", "Groceries");
  await add("expense", 1_450_00, today, "Swiggy", "Dining Out", cash.id);
  await add("expense", 2_100_00, today, "Decathlon", "Shopping");
}

async function main() {
  const chain = providerChain();
  if (chain.length === 0) return console.log("No AI providers configured. Add keys in .env.local.");
  const client = new PGlite();
  const db = drizzle({ client, schema, casing: "snake_case" }) as unknown as Db;
  await migrate(db as never, { migrationsFolder: "./drizzle" });
  const today = todayInTz("Asia/Kolkata");
  const [u] = await db.insert(schema.user).values({ id: "eval", name: "Eval", email: "eval@example.test" }).returning();
  await seed(db, u.id, today);

  for (const kind of ["month", "so_far"] as const) {
    const month = kind === "month" ? addMonths(monthOf(today), -1) : monthOf(today);
    const facts = await buildInsightFacts(db, u.id, { kind, month, today, currency: "INR" });
    if (process.env.SHOW_FACTS) console.log(JSON.stringify(facts, null, 2));
    for (const lane of lanesFor(chain[0], "chat")) {
      const start = performance.now();
      try {
        const r = await writeInsightWithModel(lane, facts);
        console.log(`\n=== ${facts.period} · ${lane.modelId} · ${Math.round(performance.now() - start)} ms\n${r.headline}`);
        for (const i of r.items) console.log(`  [${i.kind}] ${i.title}\n         ${i.detail}`);
      } catch (err) {
        console.log(`\n=== ${facts.period} · ${lane.modelId}\n✗ ${err instanceof Error ? err.message.slice(0, 300) : err}`);
      }
      await new Promise((r) => setTimeout(r, Number(process.env.AI_EVAL_DELAY_MS ?? 6000)));
    }
  }
  await client.close();
}

void main();
