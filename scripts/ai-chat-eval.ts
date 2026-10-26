// Asks the money chat realistic questions against an in-memory database with
// sample data, using the real AI provider and the real tools. Read the answers
// to judge quality after changing the model or the instructions:
//   pnpm ai:chat-eval
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { addDays, addMonths, todayInTz } from "../src/lib/dates";
import { answerWithModel, chatInstructions, moneyTools } from "../src/server/ai/chat";
import { providerChain } from "../src/server/ai/config";
import { lanesFor } from "../src/server/ai/providers";
import type { Db } from "../src/server/db";
import * as schema from "../src/server/db/schema";
import { seedNewUser } from "../src/server/db/seed-defaults";
import { createBudget } from "../src/server/services/budgets";
import { listCategories } from "../src/server/services/categories";
import { addContribution, createGoal } from "../src/server/services/goals";
import { createRule } from "../src/server/services/recurring";
import { createTransaction } from "../src/server/services/transactions";
import { createWallet, listWallets } from "../src/server/services/wallets";

const QUESTIONS = [
  "How much did I spend on food last month?",
  "What are my biggest expenses this month?",
  "Can I afford a ₹5,000 trip this month?",
  "How am I doing on my budgets?",
  "What bills are coming up?",
  "What's my total balance?",
  "Am I spending more than last month?",
  "How much have I spent on Swiggy?",
  "Delete my last entry",
  "Write me a poem about the sea",
];

async function seed(db: Db, userId: string, today: string) {
  await seedNewUser(db, userId);
  const [cash] = await listWallets(db, userId);
  const sbi = await createWallet(db, userId, {
    name: "SBI Savings",
    kind: "bank",
    color: "#4a7fc1",
    openingBalanceMinor: 25_000_00,
  });
  const card = await createWallet(db, userId, {
    name: "ICICI Credit Card",
    kind: "credit_card",
    color: "#8a64b8",
    openingBalanceMinor: 0,
  });
  const c = Object.fromEntries((await listCategories(db, userId)).map((x) => [x.name, x.id]));
  const add = (
    type: "income" | "expense",
    amount: number,
    walletId: string,
    occurredOn: string,
    description: string,
    categoryId: string,
  ) =>
    createTransaction(db, userId, {
      type,
      amount,
      occurredOn,
      description,
      notes: null,
      walletId,
      toWalletId: null,
      categoryId,
    });
  const thisMonth = today.slice(0, 7);
  const lastMonth = addMonths(thisMonth, -1);
  for (const [m, salary, groceries, swiggy] of [
    [lastMonth, 42_000_00, 5_400_00, 1_850_00],
    [thisMonth, 42_000_00, 3_100_00, 2_640_00],
  ] as const) {
    await add("income", salary, sbi.id, `${m}-01`, "Salary", c.Salary);
    await add("expense", 15_000_00, sbi.id, `${m}-05`, "Rent", c["Rent & Housing"]);
    await add("expense", groceries, sbi.id, `${m}-08`, "Big Bazaar", c.Groceries);
    await add("expense", swiggy, card.id, `${m}-12`, "Swiggy", c["Dining Out"]);
    await add("expense", 649_00, card.id, `${m}-14`, "Netflix", c.Subscriptions);
  }
  await add("expense", 4_200_00, card.id, `${lastMonth}-20`, "Myntra shoes", c.Shopping);
  await createBudget(db, userId, { categoryId: null, amount: 30_000_00, rollover: false }, thisMonth);
  await createBudget(db, userId, { categoryId: c["Dining Out"], amount: 2_500_00, rollover: false }, thisMonth);
  const trip = await createGoal(db, userId, {
    name: "Goa trip",
    target: 25_000_00,
    targetDate: null,
    icon: "plane",
    color: "#2f8f9d",
  });
  await addContribution(db, userId, trip.id, { direction: "add", amount: 8_000_00, occurredOn: today, note: null });
  await createRule(
    db,
    userId,
    {
      type: "expense",
      amount: 1_500_00,
      description: "Gym",
      walletId: cash.id,
      toWalletId: null,
      categoryId: c.Health,
      frequency: "monthly",
      interval: 1,
      anchorDate: addDays(today, 3),
      endDate: null,
      mode: "auto",
      isSubscription: true,
    },
    today,
  );
}

async function main() {
  const chain = providerChain();
  if (chain.length === 0) return console.log("No AI providers configured. Add keys in .env.local.");
  const client = new PGlite();
  const pglite = drizzle({ client, schema, casing: "snake_case" });
  await migrate(pglite, { migrationsFolder: "./drizzle" });
  const db: Db = pglite;
  const today = todayInTz("Asia/Kolkata");
  const [u] = await db.insert(schema.user).values({ id: "eval", name: "Eval", email: "eval@example.test" }).returning();
  await seed(db, u.id, today);

  const user = { id: u.id, currency: "INR", today };
  const [lane] = lanesFor(chain[0], "chat");
  console.log(`${chain[0].name} · ${lane.modelId} · today ${today}\n`);
  for (const q of QUESTIONS) {
    const start = performance.now();
    try {
      const r = await answerWithModel(lane, {
        tools: moneyTools(db, user),
        instructions: chatInstructions(user),
        messages: [{ role: "user", content: q }],
      });
      console.log(
        `Q: ${q}\nA: ${r.text}\n   [looked up: ${r.lookedUp.join(", ") || "nothing"} · ${Math.round(performance.now() - start)} ms]\n`,
      );
    } catch (err) {
      console.log(`Q: ${q}\n✗ ${err instanceof Error ? err.message.slice(0, 200) : err}\n`);
    }
    await new Promise((r) => setTimeout(r, Number(process.env.AI_EVAL_DELAY_MS ?? 4000)));
  }
  await client.close();
}

void main();
