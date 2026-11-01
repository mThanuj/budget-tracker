import { tz } from "@date-fns/tz";
import { format } from "date-fns";
import { addDays, addMonths, type ISODate, type ISOMonth } from "./dates";

// Display helpers for calendar dates (YYYY-MM-DD). Formatting happens in UTC
// because the string already is the user's local date.

const utc = tz("UTC");
const asDate = (d: ISODate) => new Date(`${d}T00:00:00Z`);

export function formatDay(date: ISODate, today: ISODate): string {
  const label = format(asDate(date), "EEE, d MMM", { in: utc });
  if (date === today) return `Today · ${label}`;
  if (date === addDays(today, -1)) return `Yesterday · ${label}`;
  return date.slice(0, 4) === today.slice(0, 4) ? label : `${label} ${date.slice(0, 4)}`;
}

export function formatMonth(month: ISOMonth): string {
  return format(asDate(`${month}-01`), "MMMM yyyy", { in: utc });
}

export function isISOMonth(v: string | undefined): v is ISOMonth {
  if (!v || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return false;
  return v >= "2000-01" && v <= "2100-12";
}

/** A real calendar date (2026-02-30 isn't) between 2000 and 2100. */
export function isISODate(v: string | undefined): v is ISODate {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = asDate(v);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v && v >= "2000-01-01" && v <= "2100-12-31";
}

/** A range of days as a heading: "1 Jan – 31 Mar 2026", "From 1 Jan 2026", "All time". Both ends inclusive. */
export function formatDateRange(from: ISODate | undefined, to: ISODate | undefined): string {
  const day = (d: ISODate, withYear = true) => format(asDate(d), withYear ? "d MMM yyyy" : "d MMM", { in: utc });
  if (from && to) return `${day(from, from.slice(0, 4) !== to.slice(0, 4))} – ${day(to)}`;
  if (from) return `From ${day(from)}`;
  if (to) return `Until ${day(to)}`;
  return "All time";
}

export function monthNeighbors(month: ISOMonth) {
  return { prev: addMonths(month, -1), next: addMonths(month, 1) };
}

/**
 * A date as it reads mid-sentence: "today", "tomorrow", "yesterday", or
 * "Mon, 26 Oct" (with the year if it isn't this year).
 */
export function relativeDay(date: ISODate, today: ISODate): string {
  if (date === today) return "today";
  if (date === addDays(today, 1)) return "tomorrow";
  if (date === addDays(today, -1)) return "yesterday";
  const label = format(asDate(date), "EEE, d MMM", { in: utc });
  return date.slice(0, 4) === today.slice(0, 4) ? label : `${label} ${date.slice(0, 4)}`;
}

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
