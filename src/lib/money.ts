// Money is stored as integer minor units (paise, cents, fils...) to avoid
// floating-point errors. The number of decimals comes from the currency itself.

const MAX_MAJOR = 1_000_000_000; // 1 billion: a sane upper bound for one entry

export function currencyExponent(currency: string): number {
  return (
    new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

let knownCurrencies: Set<string> | undefined;

/** One of the currencies the picker offers. Intl formats any 3 capital letters, even made-up codes. */
export function isValidCurrency(code: string): boolean {
  knownCurrencies ??= new Set(Intl.supportedValuesOf("currency"));
  return knownCurrencies.has(code);
}

// Indian digit grouping (1,00,000) for INR; standard grouping otherwise.
function localeFor(currency: string) {
  return currency === "INR" ? "en-IN" : "en-US";
}

/** Whole amounts in minor units have no fractional part (₹2,380.00 is whole; ₹2,380.50 isn't). */
const isWhole = (minor: number, exp: number) => minor % 10 ** exp === 0;

export function formatMoney(
  minor: number,
  currency: string,
  opts: {
    signDisplay?: "auto" | "always" | "exceptZero" | "never";
    compact?: boolean;
    /** Leave out zero decimals on whole amounts: "₹2,380" rather than "₹2,380.00". */
    trimWhole?: boolean;
  } = {},
): string {
  const exp = currencyExponent(currency);
  const fraction = opts.compact ? undefined : opts.trimWhole && isWhole(minor, exp) ? 0 : exp;
  return new Intl.NumberFormat(localeFor(currency), {
    style: "currency",
    currency,
    signDisplay: opts.signDisplay ?? "auto",
    notation: opts.compact ? "compact" : "standard",
    ...(fraction === undefined
      ? { maximumFractionDigits: 1 }
      : { minimumFractionDigits: fraction, maximumFractionDigits: fraction }),
  }).format(minor / 10 ** exp);
}

/** The currency's symbol as it appears in formatted amounts ("₹", "$", "AED"). */
export function currencySymbol(currency: string): string {
  return (
    new Intl.NumberFormat(localeFor(currency), { style: "currency", currency })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? currency
  );
}

/**
 * Parses user input like "1,234.50" into minor units.
 * Returns null for empty, negative, malformed, too-precise or absurdly large values.
 */
export function parseMoney(input: string, currency: string): number | null {
  const cleaned = input.replace(/[\s,]/g, "");
  const match = /^(\d+)(?:\.(\d*))?$/.exec(cleaned);
  if (!match) return null;

  const exp = currencyExponent(currency);
  const [, whole, frac = ""] = match;
  if (frac.length > exp) return null;
  if (Number(whole) >= MAX_MAJOR) return null;

  return Number(whole) * 10 ** exp + Number(frac.padEnd(exp, "0") || "0");
}

/**
 * Minor units → plain decimal string for form inputs ("1234.5" → "1234.50").
 * With trimWhole, whole amounts drop their zero decimals ("1234").
 */
export function minorToInput(minor: number, currency: string, opts: { trimWhole?: boolean } = {}): string {
  const exp = currencyExponent(currency);
  if (exp === 0 || (opts.trimWhole && isWhole(minor, exp))) return String(minor / 10 ** exp);
  const s = String(Math.abs(minor)).padStart(exp + 1, "0");
  return `${minor < 0 ? "-" : ""}${s.slice(0, -exp)}.${s.slice(-exp)}`;
}
