// Shared by the server (which builds and writes insights) and the UI.

export type InsightKind = "month" | "so_far";

/** A month needs at least this many entries before a report says anything useful. */
export const MIN_ENTRIES_FOR_INSIGHTS = 5;

/**
 * Everything a report may mention, already worked out and formatted. The AI
 * only gets these strings, so every number it writes can be checked against them.
 */
export type InsightFacts = {
  kind: InsightKind;
  period: string;
  dayOfMonth: { day: number; daysInMonth: number } | null;
  entries: number;
  income: string;
  spending: string;
  kept: { amount: string; shareOfIncome: string } | null;
  spentMoreThanIncomeBy: string | null;
  noIncomeRecorded: boolean;
  comparedWith: { period: string; spending: string; change: string } | null;
  averageMonthlySpendingBefore: string | null;
  categories: { name: string; spent: string; shareOfSpending: string; before: string; change: string }[];
  overallLimit: {
    limit: string;
    spent: string;
    used: string;
    left: string | null;
    over: string | null;
    projectedMonthEnd: string | null;
    projectedOverLimit: boolean;
  } | null;
  budgetsOver: { category: string; limit: string; spent: string; over: string }[];
  budgetsNearLimit: { category: string; limit: string; spent: string; used: string }[];
  biggestExpenses: { what: string; amount: string; date: string; category: string }[];
  possibleDuplicates: { what: string; amount: string; dates: string[] }[];
  /** Charges from recurring items marked as subscriptions (not the Subscriptions category). */
  trackedSubscriptions: { count: number; spent: string } | null;
  priceChanges: { name: string; from: string; to: string }[];
  goals: { name: string; saved: string; target: string; addedInPeriod: string; status: string }[];
  entriesWithoutCategory: number;
};

export type InsightItem = { kind: "good" | "watch" | "tip"; title: string; detail: string };
export type InsightReport = { headline: string; items: InsightItem[] };
