import { suggestLimit } from "./budgets";
import { currencyExponent } from "./money";

// Turns what a new user told us into a starter budget, using the 50/30/20
// idea: about half for needs, a third for wants, a fifth saved. Fixed bills
// count as spending, so the monthly limit includes them.

export type PlanInput = {
  monthlyIncomeMinor: number;
  monthlyBillsMinor: number; // rent, EMIs, phone, subscriptions…
  watchCategories: string[]; // categories where money slips away
  currency: string;
};

export type CategorySuggestion = { name: string; amountMinor: number };

export type Plan = {
  limitMinor: number | null; // overall monthly spending limit
  saveMinor: number; // what's left to save each month
  flexibleMinor: number; // limit minus fixed bills: everything else
  categories: CategorySuggestion[];
  notes: string[];
};

// Rough share of the flexible money each commonly watched category gets.
const SHARE: Record<string, number> = {
  Groceries: 0.35,
  "Dining Out": 0.15,
  Transport: 0.12,
  Fuel: 0.12,
  Shopping: 0.15,
  Entertainment: 0.1,
  "Personal Care": 0.05,
  Travel: 0.1,
  Health: 0.08,
};
const DEFAULT_SHARE = 0.08;
// Category budgets never take more than this much of the flexible money in total.
const MAX_ALLOCATED = 0.8;

const nice = (minor: number, currency: string) => suggestLimit(minor, currency) ?? 0;

/** Rounds down to a friendly number (so savings never shrink below the plan). */
function niceDown(minor: number, currency: string) {
  const unit = 10 ** currencyExponent(currency);
  const major = minor / unit;
  const step = major < 1_000 ? 50 : major < 10_000 ? 100 : 500;
  return Math.floor(major / step) * step * unit;
}

export function buildPlan(input: PlanInput): Plan {
  const { monthlyIncomeMinor: income, monthlyBillsMinor: bills, currency } = input;
  if (income <= 0) {
    return {
      limitMinor: null,
      saveMinor: 0,
      flexibleMinor: 0,
      categories: [],
      notes: ["Add your income to get a suggested monthly limit. You can set one yourself on the Budgets page."],
    };
  }

  const notes: string[] = [];
  let limit = niceDown(income * 0.8, currency);
  if (bills > limit) {
    // Bills alone eat into savings: keep a small cushion above them.
    limit = Math.max(Math.min(income, niceDown(bills * 1.1, currency)), bills);
    notes.push("Your fixed bills take most of your income, so there's less room to save. Even a small amount each month helps.");
  } else {
    notes.push("About 20% of your income is kept aside to save. The rest is your monthly spending limit, bills included.");
  }
  const save = Math.max(income - limit, 0);
  const flexible = Math.max(limit - bills, 0);

  const raw = input.watchCategories.map((name) => ({ name, share: SHARE[name] ?? DEFAULT_SHARE }));
  const total = raw.reduce((s, r) => s + r.share, 0);
  const scale = total > MAX_ALLOCATED ? MAX_ALLOCATED / total : 1;
  const categories = raw
    .map((r) => ({ name: r.name, amountMinor: nice(flexible * r.share * scale, currency) }))
    .filter((c) => c.amountMinor > 0);

  return { limitMinor: limit, saveMinor: save, flexibleMinor: flexible, categories, notes };
}
