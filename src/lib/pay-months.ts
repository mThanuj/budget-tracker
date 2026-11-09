import { addDays, addMonths, type ISODate, type ISOMonth, monthOf, monthRange } from "./dates";

// Pay months (Insights, when a main income is set): November runs from the day
// November's pay arrived at the end of October up to the day December's did.

/** Days at the end of a month in which the main income starts the next pay month. */
export const PAY_WINDOW_DAYS = 7;

/** The last Monday to Friday of a month. Bank holidays aren't known. */
export function lastWorkingDay(month: ISOMonth): ISODate {
  let day = addDays(monthRange(month).end, -1);
  while ([0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay())) day = addDays(day, -1);
  return day;
}

/**
 * The day pay month `month` starts: the first main-income date in the last
 * 7 days of the month before, or that month's last working day if none is
 * recorded there. `paydays` are the main income's dates, in any order.
 */
export function payMonthStart(month: ISOMonth, paydays: readonly ISODate[]): ISODate {
  const before = addMonths(month, -1);
  const { end } = monthRange(before);
  const from = addDays(end, -PAY_WINDOW_DAYS);
  const [first] = paydays.filter((d) => d >= from && d < end).sort();
  return first ?? lastWorkingDay(before);
}

/** Pay month `month` as a half-open range [start, end), like `monthRange`. */
export function payMonthRange(month: ISOMonth, paydays: readonly ISODate[]): { start: ISODate; end: ISODate } {
  return { start: payMonthStart(month, paydays), end: payMonthStart(addMonths(month, 1), paydays) };
}

/** The pay month `today` is in: its calendar month's, or the next one's once that has started. */
export function payMonthOf(today: ISODate, paydays: readonly ISODate[]): ISOMonth {
  const next = addMonths(monthOf(today), 1);
  return today >= payMonthStart(next, paydays) ? next : monthOf(today);
}
