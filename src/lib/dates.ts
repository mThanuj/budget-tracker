import { tz } from "@date-fns/tz";
import { format } from "date-fns";

// All calendar dates are "YYYY-MM-DD" strings in the user's own timezone.
// Never use the server's timezone: the server runs in UTC.

export type ISODate = string; // YYYY-MM-DD
export type ISOMonth = string; // YYYY-MM

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function todayInTz(timeZone: string, now: Date = new Date()): ISODate {
  return format(now, "yyyy-MM-dd", { in: tz(timeZone) });
}

export function monthOf(date: ISODate): ISOMonth {
  return date.slice(0, 7);
}

function toUTC(date: ISODate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUTC(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = toUTC(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUTC(d);
}

export function addMonths(month: ISOMonth, months: number): ISOMonth {
  const [y, m] = month.split("-").map(Number);
  return fromUTC(new Date(Date.UTC(y, m - 1 + months, 1))).slice(0, 7);
}

/** Half-open range [start, end) covering the whole month. */
export function monthRange(month: ISOMonth): { start: ISODate; end: ISODate } {
  return { start: `${month}-01`, end: `${addMonths(month, 1)}-01` };
}

/**
 * The same stretch of the previous month as this month so far, end exclusive:
 * on the 24th, the 1st–24th of last month (cut short if last month was shorter).
 * Used to compare "this month so far" like for like.
 */
export function sameDaysLastMonth(today: ISODate): { start: ISODate; end: ISODate } {
  const prev = monthRange(addMonths(monthOf(today), -1));
  const end = addDays(prev.start, Number(today.slice(8, 10)));
  return { start: prev.start, end: end < prev.end ? end : prev.end };
}
