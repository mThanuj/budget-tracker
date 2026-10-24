import type { ISODate } from "./dates";
import { normalizeMerchant } from "./merchant";
import { type Frequency, occurrence } from "./recurring";

export type SpendRecord = {
  id: string;
  description: string;
  amountMinor: number;
  occurredOn: ISODate;
  categoryId: string | null;
  walletId: string;
};

export type SubscriptionCandidate = {
  merchantKey: string;
  name: string; // latest description, as the user typed it
  amountMinor: number; // latest amount
  frequency: Frequency;
  lastOn: ISODate;
  nextExpectedOn: ISODate;
  occurrences: number;
  categoryId: string | null;
  walletId: string;
  transactionIds: string[];
};

const PATTERNS: { frequency: Frequency; min: number; max: number; minCount: number }[] = [
  { frequency: "weekly", min: 6, max: 8, minCount: 4 },
  { frequency: "monthly", min: 26, max: 35, minCount: 3 },
  { frequency: "yearly", min: 350, max: 380, minCount: 2 },
];

const days = (a: ISODate, b: ISODate) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/**
 * Finds spending that repeats at a steady rhythm for the same amount, e.g. the
 * same merchant about every month. One price change is allowed; a regular
 * shop with different amounts each time doesn't look like a subscription.
 */
export function detectSubscriptions(records: SpendRecord[], ignoreKeys: Set<string>): SubscriptionCandidate[] {
  const groups = new Map<string, SpendRecord[]>();
  for (const r of records) {
    const key = normalizeMerchant(r.description);
    if (!key || ignoreKeys.has(key)) continue;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const found: SubscriptionCandidate[] = [];
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
    // One charge per date (duplicates on a day aren't a rhythm).
    const byDay = sorted.filter((r, i) => i === 0 || r.occurredOn !== sorted[i - 1].occurredOn);
    const gaps = byDay.slice(1).map((r, i) => days(byDay[i].occurredOn, r.occurredOn));
    // Subscriptions charge the same amount each time, apart from the odd price
    // change, so all but one charge must match. Regular shopping varies.
    const amounts = byDay.map((r) => r.amountMinor);
    const sameAsMost = Math.max(...amounts.map((a) => amounts.filter((b) => Math.abs(a - b) <= a * 0.01).length));
    if (sameAsMost < Math.max(2, amounts.length - 1) || gaps.length === 0) continue;

    const pattern = PATTERNS.find(
      (p) => byDay.length >= p.minCount && gaps.every((g) => g >= p.min && g <= p.max),
    );
    if (!pattern) continue;

    const last = byDay.at(-1)!;
    found.push({
      merchantKey: key,
      name: last.description,
      amountMinor: last.amountMinor,
      frequency: pattern.frequency,
      lastOn: last.occurredOn,
      // Same weekday / day of month as the last charge.
      nextExpectedOn: occurrence({ frequency: pattern.frequency, interval: 1, anchorDate: last.occurredOn, endDate: null }, 1),
      occurrences: byDay.length,
      categoryId: last.categoryId,
      walletId: last.walletId,
      transactionIds: sorted.map((r) => r.id),
    });
  }
  return found.sort((a, b) => b.amountMinor - a.amountMinor);
}
