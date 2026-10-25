import { tz } from "@date-fns/tz";
import { format } from "date-fns";
import { generateText, Output } from "ai";
import { z } from "zod";
import { addDays, type ISODate } from "@/lib/dates";
import { currencyExponent } from "@/lib/money";
import type { ModelChoice } from "./providers";

export type EntryContext = {
  today: ISODate;
  timeZone: string;
  currency: string;
  wallets: { id: string; name: string }[];
  defaultWalletId: string | null;
  categories: { id: string; name: string; kind: "income" | "expense" }[];
};

export type EntryPrefill = {
  type: "income" | "expense" | "transfer";
  amountMinor: number;
  description: string;
  occurredOn: ISODate;
  walletId: string | null;
  toWalletId: string | null;
  categoryId: string | null;
};

// Groq's schema validator wrongly rejects a one-value enum (common: a new user's
// only wallet is Cash), so lists of fewer than two values are plain strings.
// toPrefill() matches names against the user's real data either way.
const enumOrNull = (values: string[]) => {
  const unique = [...new Set(values)];
  return (unique.length >= 2 ? z.enum(unique as [string, ...string[]]) : z.string()).nullable();
};

/** The shape the model must return. Every field is required (strict schema), nullable where optional. */
export function entrySchema(ctx: EntryContext) {
  const wallets = ctx.wallets.map((w) => w.name);
  return z.object({
    type: z.enum(["expense", "income", "transfer"]),
    amount: z.number().describe(`Positive amount in ${ctx.currency}, e.g. 240 or 1500.5`),
    description: z.string().describe("2 to 5 words: what it was for or who was paid"),
    date: z.string().describe("YYYY-MM-DD"),
    wallet: enumOrNull(wallets).describe("Wallet the money came from (or went into, for income)"),
    toWallet: enumOrNull(wallets).describe("Destination wallet, only for transfers"),
    category: enumOrNull(ctx.categories.map((c) => c.name)),
  });
}

export type RawEntry = z.infer<ReturnType<typeof entrySchema>>;

/**
 * Kept short on purpose: free providers limit tokens per minute. Wallet and
 * category names aren't repeated here because the schema already lists them.
 */
export function entryInstructions(ctx: EntryContext): string {
  const dayName = (d: ISODate, pattern: string) => format(new Date(`${d}T12:00:00Z`), pattern, { in: tz("UTC") });
  const weekday = dayName(ctx.today, "EEEE");
  // Small models get weekday arithmetic wrong; spell out the past week instead.
  const pastWeek = [1, 2, 3, 4, 5, 6]
    .map((n) => addDays(ctx.today, -n))
    .map((d) => `${dayName(d, "EEE")} ${d}`)
    .join(", ");
  const income = ctx.categories.filter((c) => c.kind === "income").map((c) => c.name);
  return [
    `Turn a note about money into one entry for an Indian budgeting app. Today is ${weekday}, ${ctx.today}. Amounts are in ${ctx.currency}.`,
    "- type: expense (spent or paid), income (received: salary, refund, cashback, gift), or transfer (between the user's own wallets: ATM withdrawal = bank to Cash; paying a credit card bill = bank to the card, even if the note says paid; moving to savings).",
    "- amount: a positive number. 2k = 2000, 1.5k = 1500, 1L = 1 lakh = 100000, 1cr = 10000000.",
    "- description: 2 to 5 of the user's words, without amount or date.",
    `- date: YYYY-MM-DD. Yesterday = ${addDays(ctx.today, -1)}; day before yesterday = ${addDays(ctx.today, -2)}. Past week: ${pastWeek}; a weekday name means its date in that list. Resolve "21st" or "12 Oct" from today. No date given: today.`,
    "- wallet: where the money came from (or went to, for income), only if mentioned; toWallet: destination, transfers only. Otherwise null.",
    "- category: best fit for the type; null for transfers. Ready-to-eat food and drinks (chai, coffee, snacks, meals, Swiggy, Zomato) are Dining Out; ingredients and household items are Groceries; books and courses are Education.",
    "- A gift for someone is spending; a gift from someone is income.",
    `Income categories are: ${income.join(", ") || "none"}. All other categories are for spending.`,
  ].join("\n");
}

export async function extractEntryWithModel(m: ModelChoice, ctx: EntryContext, text: string): Promise<RawEntry> {
  const { output } = await generateText({
    model: m.model,
    providerOptions: m.providerOptions,
    maxRetries: 0,
    timeout: 15_000,
    instructions: entryInstructions(ctx),
    prompt: text.slice(0, 300),
    output: Output.object({ schema: entrySchema(ctx) }),
  });
  return output;
}

const byName = <T extends { name: string }>(list: T[], name: string | null) =>
  name ? list.find((x) => x.name.toLowerCase() === name.trim().toLowerCase()) : undefined;

/**
 * Checks the model's answer against the user's real data before it reaches the
 * form: sane amount, a date near today, wallets and categories that exist and
 * fit the entry type. Returns null if there's no usable amount.
 */
export function toPrefill(ctx: EntryContext, raw: RawEntry): EntryPrefill | null {
  const exp = currencyExponent(ctx.currency);
  const amountMinor = Math.round(raw.amount * 10 ** exp);
  if (!Number.isFinite(amountMinor) || amountMinor <= 0 || raw.amount >= 1_000_000_000) return null;

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(raw.date) && !Number.isNaN(Date.parse(`${raw.date}T00:00:00Z`));
  const occurredOn =
    validDate && raw.date >= addDays(ctx.today, -366) && raw.date <= addDays(ctx.today, 31) ? raw.date : ctx.today;

  const wallet = byName(ctx.wallets, raw.wallet);
  const walletId = wallet?.id ?? ctx.defaultWalletId ?? ctx.wallets[0]?.id ?? null;
  const toWallet = raw.type === "transfer" ? byName(ctx.wallets, raw.toWallet) : undefined;

  const category =
    raw.type === "transfer"
      ? undefined
      : byName(
          ctx.categories.filter((c) => c.kind === raw.type),
          raw.category,
        );
  return {
    type: raw.type,
    amountMinor,
    description: raw.description.trim().slice(0, 200),
    occurredOn,
    walletId,
    toWalletId: toWallet && toWallet.id !== walletId ? toWallet.id : null,
    categoryId: category?.id ?? null,
  };
}
