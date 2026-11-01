// What the Entries page shows, read from its address so a search can be shared
// and survives a reload. Used by the page (server) and the filters (client), so
// both agree on the parameter names.
import { isISODate, isISOMonth } from "./date-format";
import { type ISODate, type ISOMonth, monthOf } from "./dates";
import { parseMoney } from "./money";

/** Entries shown at a time when searching across months ("Show 200 more"). */
export const SEARCH_PAGE = 200;
/** At most this many at once; narrow the dates or filters to see older ones. */
export const SEARCH_MAX = 1_000;

/** The page's address parameters, as strings (all optional). */
export type EntrySearchParams = {
  month?: string; // one month: YYYY-MM
  period?: string; // "all": every month
  from?: string; // YYYY-MM-DD, inclusive
  to?: string; // YYYY-MM-DD, inclusive
  min?: string; // amounts as typed, in the account's currency
  max?: string;
  limit?: string;
  wallet?: string;
  category?: string;
  type?: string;
  q?: string;
};

export type EntrySearch = {
  /** One month (with the month switcher), or a range of days (open-ended when a side is missing). */
  period: { mode: "month"; month: ISOMonth } | { mode: "range"; from?: ISODate; to?: ISODate };
  minMinor?: number;
  maxMinor?: number;
  /** Rows to show in range mode. */
  limit: number;
};

/** Reads the address. Anything malformed is ignored rather than refused: it's just a search. */
export function parseEntrySearch(raw: EntrySearchParams, { currency, today }: { currency: string; today: ISODate }) {
  const from = isISODate(raw.from) ? raw.from : undefined;
  const to = isISODate(raw.to) ? raw.to : undefined;
  let period: EntrySearch["period"];
  if (from || to) {
    period = from && to && from > to ? { mode: "range", from: to, to: from } : { mode: "range", from, to };
  } else if (raw.period === "all") {
    period = { mode: "range" };
  } else {
    period = { mode: "month", month: isISOMonth(raw.month) ? raw.month : monthOf(today) };
  }

  const amount = (v: string | undefined) => (v?.trim() ? (parseMoney(v.trim(), currency) ?? undefined) : undefined);
  let [minMinor, maxMinor] = [amount(raw.min), amount(raw.max)];
  if (minMinor !== undefined && maxMinor !== undefined && minMinor > maxMinor)
    [minMinor, maxMinor] = [maxMinor, minMinor];

  const asked = Number(raw.limit);
  const limit = Number.isInteger(asked) ? Math.min(Math.max(asked, SEARCH_PAGE), SEARCH_MAX) : SEARCH_PAGE;
  return { period, minMinor, maxMinor, limit } satisfies EntrySearch;
}

const ORDER: (keyof EntrySearchParams)[] = [
  "month",
  "period",
  "from",
  "to",
  "q",
  "wallet",
  "category",
  "type",
  "min",
  "max",
  "limit",
];

/** The query part of the Entries page's address ("" or "?…"; empty values left out, in a stable order). */
export function entrySearchQuery(params: EntrySearchParams): string {
  const query = new URLSearchParams();
  for (const key of ORDER) {
    const value = params[key]?.trim();
    if (value) query.set(key, value);
  }
  const s = query.toString();
  return s ? `?${s}` : "";
}

/** The Entries page's address for these parameters. */
export function entrySearchHref(params: EntrySearchParams): string {
  return `/transactions${entrySearchQuery(params)}`;
}
