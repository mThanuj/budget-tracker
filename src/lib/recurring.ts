import { addDays, addMonths, type ISODate } from "./dates";

export type Frequency = "weekly" | "monthly" | "yearly";

export type Schedule = {
  frequency: Frequency;
  interval: number; // every N weeks / months / years
  anchorDate: ISODate;
  endDate: ISODate | null;
};

function daysInMonth(month: string): number {
  const next = new Date(`${addMonths(month, 1)}-01T00:00:00Z`);
  return new Date(next.getTime() - 86_400_000).getUTCDate();
}

function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * The nth occurrence (n = 0 is the anchor). Months count from the anchor, so a
 * schedule on the 31st clamps to short months without drifting: Jan 31, Feb 28, Mar 31.
 */
export function occurrence(s: Schedule, n: number): ISODate {
  if (s.frequency === "weekly") return addDays(s.anchorDate, 7 * s.interval * n);
  const months = (s.frequency === "yearly" ? 12 : 1) * s.interval * n;
  const month = addMonths(s.anchorDate.slice(0, 7), months);
  const day = Math.min(Number(s.anchorDate.slice(8, 10)), daysInMonth(month));
  return `${month}-${String(day).padStart(2, "0")}`;
}

/** First occurrence on or after `date`, or null if the schedule has ended by then. */
export function occurrenceOnOrAfter(s: Schedule, date: ISODate): ISODate | null {
  let n = 0;
  if (date > s.anchorDate) {
    if (s.frequency === "weekly") {
      n = Math.ceil(daysBetween(s.anchorDate, date) / (7 * s.interval));
    } else {
      const step = (s.frequency === "yearly" ? 12 : 1) * s.interval;
      const [ay, am] = s.anchorDate.split("-").map(Number);
      const [dy, dm] = date.split("-").map(Number);
      n = Math.max(0, Math.floor(((dy - ay) * 12 + (dm - am)) / step));
      while (occurrence(s, n) < date) n++;
    }
  }
  const found = occurrence(s, n);
  return s.endDate && found > s.endDate ? null : found;
}

/** All occurrences in [from, to] (inclusive), capped to stop runaway catch-up. */
export function occurrencesBetween(s: Schedule, from: ISODate, to: ISODate, cap = 400): ISODate[] {
  const out: ISODate[] = [];
  let next = occurrenceOnOrAfter(s, from);
  while (next && next <= to && out.length < cap) {
    out.push(next);
    next = occurrenceOnOrAfter(s, addDays(next, 1));
  }
  return out;
}

/** What a schedule costs per month on average (for subscription totals). */
export function monthlyEquivalent(amountMinor: number, frequency: Frequency, interval: number): number {
  const perYear = frequency === "weekly" ? 52 / interval : frequency === "monthly" ? 12 / interval : 1 / interval;
  return Math.round((amountMinor * perYear) / 12);
}

/** Choices shown in the form, mapped to frequency + interval. */
export const REPEAT_OPTIONS = [
  { value: "weekly-1", label: "Every week", frequency: "weekly", interval: 1 },
  { value: "weekly-2", label: "Every 2 weeks", frequency: "weekly", interval: 2 },
  { value: "monthly-1", label: "Every month", frequency: "monthly", interval: 1 },
  { value: "monthly-3", label: "Every 3 months", frequency: "monthly", interval: 3 },
  { value: "monthly-6", label: "Every 6 months", frequency: "monthly", interval: 6 },
  { value: "yearly-1", label: "Every year", frequency: "yearly", interval: 1 },
] as const satisfies readonly { value: string; label: string; frequency: Frequency; interval: number }[];

export function describeRepeat(frequency: Frequency, interval: number, anchorDate: ISODate): string {
  const option = REPEAT_OPTIONS.find((o) => o.frequency === frequency && o.interval === interval);
  const base =
    option?.label ??
    `Every ${interval} ${frequency === "weekly" ? "weeks" : frequency === "monthly" ? "months" : "years"}`;
  if (frequency === "monthly") {
    const day = Number(anchorDate.slice(8, 10));
    const suffix =
      day % 10 === 1 && day !== 11
        ? "st"
        : day % 10 === 2 && day !== 12
          ? "nd"
          : day % 10 === 3 && day !== 13
            ? "rd"
            : "th";
    return `${base} on the ${day}${suffix}`;
  }
  return base;
}
