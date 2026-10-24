import { addMonths, type ISODate, type ISOMonth, monthOf } from "./dates";
import { currencyExponent } from "./money";

export type BudgetLevel = "ok" | "warning" | "over";

/** Share of a budget used before we start warning. */
export const WARNING_RATIO = 0.8;

/** Whole months from `from` (inclusive) to `to` (exclusive); negative if `to` is earlier. */
export function monthsBetween(from: ISOMonth, to: ISOMonth): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/**
 * Money carried into `month` for a rollover budget: every month since
 * `rolloverFrom` adds its limit and subtracts what was spent. Negative when
 * past overspending outweighs past leftovers.
 */
export function carryIn({
  limitMinor,
  rolloverFrom,
  month,
  spentSinceMinor,
}: {
  limitMinor: number;
  rolloverFrom: ISOMonth;
  month: ISOMonth;
  spentSinceMinor: number; // spending in [rolloverFrom, month)
}): number {
  const months = monthsBetween(rolloverFrom, month);
  if (months <= 0) return 0;
  return limitMinor * months - spentSinceMinor;
}

export function budgetProgress({
  limitMinor,
  carryInMinor = 0,
  spentMinor,
}: {
  limitMinor: number;
  carryInMinor?: number;
  spentMinor: number;
}) {
  const availableMinor = limitMinor + carryInMinor;
  const remainingMinor = availableMinor - spentMinor;
  const ratio = availableMinor > 0 ? spentMinor / availableMinor : spentMinor > 0 ? Number.POSITIVE_INFINITY : 0;
  const level: BudgetLevel = remainingMinor < 0 ? "over" : ratio >= WARNING_RATIO ? "warning" : "ok";
  return { availableMinor, remainingMinor, ratio, level };
}

/** Days left in the month counting today, or null if `month` isn't the current one. */
export function daysLeftInMonth(month: ISOMonth, today: ISODate): number | null {
  if (monthOf(today) !== month) return null;
  const nextMonthStart = new Date(`${addMonths(month, 1)}-01T00:00:00Z`);
  const lastDay = new Date(nextMonthStart.getTime() - 86_400_000).getUTCDate();
  return lastDay - Number(today.slice(8, 10)) + 1;
}

/**
 * A round, slightly generous monthly limit based on average past spending,
 * e.g. ₹2,637 → ₹2,700. Null when there's no history to go on.
 */
export function suggestLimit(averageMinor: number, currency: string): number | null {
  if (averageMinor <= 0) return null;
  const unit = 10 ** currencyExponent(currency);
  const major = averageMinor / unit;
  const step = major < 1_000 ? 50 : major < 10_000 ? 100 : 500;
  return Math.ceil(major / step) * step * unit;
}
