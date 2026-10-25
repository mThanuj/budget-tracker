import { generateText, Output } from "ai";
import { z } from "zod";
import { addDays, type ISODate } from "@/lib/dates";
import { minorToInput, parseMoney } from "@/lib/money";
import type { BillRow, GoalRow, IncomeRow, SetupRows, SetupStep, WalletRow } from "@/lib/setup-types";
import type { ModelChoice } from "./providers";

export type SetupContext = {
  today: ISODate;
  currency: string;
  expenseCategories: { id: string; name: string }[];
};

// Strict-schema friendly: every field required, nullable where optional, and
// no one-value enums (see parse-entry.ts).
const names = (values: string[]) => {
  const unique = [...new Set(values)];
  return (unique.length >= 2 ? z.enum(unique as [string, ...string[]]) : z.string()).nullable();
};

const day = z.number().int().nullable().describe("Day of the month (1-31) it happens, or null");

/** One object schema per step; Output.object needs them as a single type. */
function schemaFor(step: SetupStep, ctx: SetupContext): z.ZodType<Record<string, unknown>> {
  switch (step) {
    case "wallets":
      return z.object({
        wallets: z.array(
          z.object({
            name: z.string().describe('Short name, e.g. "SBI Savings", "ICICI Credit Card", "Cash"'),
            kind: z.enum(["bank", "credit_card", "cash", "other"]),
            balance: z.number().nullable().describe("Money in it now; for a credit card, the amount owed. null if not said"),
          }),
        ),
      });
    case "incomes":
      return z.object({ incomes: z.array(z.object({ name: z.string(), amount: z.number(), day })) });
    case "bills":
      return z.object({
        bills: z.array(
          z.object({
            name: z.string(),
            amount: z.number(),
            day,
            category: names(ctx.expenseCategories.map((c) => c.name)),
            subscription: z.boolean().describe("true for streaming, apps, gym and similar memberships"),
          }),
        ),
      });
    case "goals":
      return z.object({
        goals: z.array(
          z.object({
            name: z.string(),
            target: z.number(),
            by: z.string().nullable().describe("Target date as YYYY-MM-DD, or null"),
          }),
        ),
      });
  }
}

const PROMPTS: Record<SetupStep, string> = {
  wallets: "List the places the user keeps money: bank accounts, credit cards, cash, UPI wallets.",
  incomes: "List money the user receives regularly each month (salary, freelance, rent received, allowance).",
  bills: "List fixed monthly payments: rent, EMIs, phone, internet, insurance, subscriptions, fees.",
  goals: "List things the user is saving up for, with the amount needed.",
};

export async function extractSetupWithModel(m: ModelChoice, step: SetupStep, ctx: SetupContext, text: string) {
  const { output } = await generateText({
    model: m.model,
    providerOptions: m.providerOptions,
    maxRetries: 0,
    timeout: 15_000,
    instructions: [
      `${PROMPTS[step]} The user is setting up an Indian budgeting app. Today is ${ctx.today}. Amounts are in ${ctx.currency}.`,
      "Amounts: 2k = 2000, 1.5L = 1 lakh 50 thousand = 150000, 1cr = 10000000. Use the user's own words for names, kept short.",
      "Only include what the user actually mentioned. An empty list is fine.",
    ].join("\n"),
    prompt: text.slice(0, 500),
    // One step's schema at a time; the union confuses inference, so widen it here.
    output: Output.object({ schema: schemaFor(step, ctx) }),
  });
  return output;
}

const amountText = (n: unknown, currency: string) => {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0 || n >= 1_000_000_000) return "";
  const minor = parseMoney(n.toFixed(2), currency) ?? parseMoney(String(Math.round(n)), currency);
  return minor ? minorToInput(minor, currency, { trimWhole: true }) : "";
};
const dayText = (d: unknown) => (typeof d === "number" && d >= 1 && d <= 31 ? String(Math.trunc(d)) : "");
const nameText = (s: unknown) => (typeof s === "string" ? s.trim().slice(0, 40) : "");

/** Model answer → editable rows, keeping only sane values. */
export function toSetupRows(step: SetupStep, raw: Record<string, unknown>, ctx: SetupContext): SetupRows[SetupStep] {
  const list = (key: string) => (Array.isArray(raw[key]) ? (raw[key] as Record<string, unknown>[]) : []).slice(0, 12);
  switch (step) {
    case "wallets":
      return list("wallets")
        .map((w): WalletRow => ({
          name: nameText(w.name),
          kind: (["bank", "credit_card", "cash", "other"] as const).find((k) => k === w.kind) ?? "other",
          balance: amountText(w.balance, ctx.currency),
        }))
        .filter((w) => w.name);
    case "incomes":
      return list("incomes")
        .map((i): IncomeRow => ({ name: nameText(i.name), amount: amountText(i.amount, ctx.currency), day: dayText(i.day) }))
        .filter((i) => i.name && i.amount);
    case "bills":
      return list("bills")
        .map((b): BillRow => ({
          name: nameText(b.name),
          amount: amountText(b.amount, ctx.currency),
          day: dayText(b.day),
          subscription: b.subscription === true,
          categoryId:
            ctx.expenseCategories.find((c) => typeof b.category === "string" && c.name.toLowerCase() === b.category.toLowerCase())?.id ?? null,
        }))
        .filter((b) => b.name && b.amount);
    case "goals":
      return list("goals")
        .map((g): GoalRow => {
          const by = typeof g.by === "string" && /^\d{4}-\d{2}-\d{2}$/.test(g.by) && g.by > ctx.today && g.by < addDays(ctx.today, 365 * 50) ? g.by : "";
          return { name: nameText(g.name), target: amountText(g.target, ctx.currency), by };
        })
        .filter((g) => g.name && g.target);
  }
}
