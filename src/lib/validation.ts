import { z } from "zod";
import { isCategoryIcon } from "./category-icons";
import { addDays, type ISODate } from "./dates";
import { parseMoney } from "./money";

// Form schemas shared by client forms and server actions. They accept raw
// FormData strings and produce clean values; ownership checks live in services.

const optionalId = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.uuid().nullable());

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, "Pick a color.");

const name = (what: string) =>
  z
    .string()
    .trim()
    .min(1, `Give the ${what} a name.`)
    .max(40, `Keep the ${what} name under 40 characters.`);

export function moneyField(currency: string, { allowZero = false } = {}) {
  return z.string().transform((raw, ctx) => {
    const value = parseMoney(raw, currency);
    if (value === null || (!allowZero && value === 0)) {
      ctx.addIssue({ code: "custom", message: "Enter an amount like 250 or 1,250.50." });
      return z.NEVER;
    }
    return value;
  });
}

export function transactionSchema(currency: string, today: ISODate) {
  const earliest = addDays(today, -3650);
  const latest = addDays(today, 366);
  return z
    .object({
      type: z.enum(["income", "expense", "transfer"]),
      amount: moneyField(currency),
      occurredOn: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.")
        .refine((d) => d >= earliest && d <= latest, "Pick a date within the last 10 years."),
      description: z.string().trim().max(200, "Keep the description under 200 characters."),
      notes: z
        .string()
        .trim()
        .max(1000, "Keep notes under 1,000 characters.")
        .optional()
        .transform((v) => (v ? v : null)),
      walletId: z.uuid("Choose a wallet."),
      toWalletId: optionalId,
      categoryId: optionalId,
    })
    .superRefine((v, ctx) => {
      if (v.type === "transfer") {
        if (!v.toWalletId) ctx.addIssue({ code: "custom", path: ["toWalletId"], message: "Choose where the money goes." });
        else if (v.toWalletId === v.walletId)
          ctx.addIssue({ code: "custom", path: ["toWalletId"], message: "Pick two different wallets." });
      }
    })
    .transform((v) => ({
      ...v,
      toWalletId: v.type === "transfer" ? v.toWalletId : null,
      categoryId: v.type === "transfer" ? null : v.categoryId,
    }));
}

export type TransactionInput = z.output<ReturnType<typeof transactionSchema>>;

export function walletSchema(currency: string) {
  return z
    .object({
      name: name("wallet"),
      kind: z.enum(["cash", "bank", "credit_card", "other"]),
      color: hexColor,
      // For credit cards the form asks for the amount currently owed.
      openingBalance: z.string().optional().transform((v) => (v?.trim() ? v : "0")).pipe(moneyField(currency, { allowZero: true })),
    })
    .transform(({ openingBalance, ...v }) => ({
      ...v,
      openingBalanceMinor: v.kind === "credit_card" ? -openingBalance : openingBalance,
    }));
}

export type WalletInput = z.output<ReturnType<typeof walletSchema>>;

export const categorySchema = z.object({
  name: name("category"),
  kind: z.enum(["income", "expense"]),
  icon: z.string().refine(isCategoryIcon, "Pick an icon."),
  color: hexColor,
});

export type CategoryInput = z.output<typeof categorySchema>;

/** First error message per field, for showing next to inputs. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
