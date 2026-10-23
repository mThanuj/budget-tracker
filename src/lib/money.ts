// Money is stored as integer minor units (paise, cents, fils...) to avoid
// floating-point errors. The number of decimals comes from the currency itself.

const MAX_MAJOR = 1_000_000_000; // 1 billion: a sane upper bound for one entry

export function currencyExponent(currency: string): number {
  return (
    new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

export function isValidCurrency(code: string): boolean {
  if (!/^[A-Z]{3}$/.test(code)) return false;
  try {
    new Intl.NumberFormat("en", { style: "currency", currency: code });
    return true;
  } catch {
    return false;
  }
}

// Indian digit grouping (1,00,000) for INR; standard grouping otherwise.
function localeFor(currency: string) {
  return currency === "INR" ? "en-IN" : "en-US";
}

export function formatMoney(
  minor: number,
  currency: string,
  opts: { signDisplay?: "auto" | "always" | "exceptZero" | "never"; compact?: boolean } = {},
): string {
  const exp = currencyExponent(currency);
  return new Intl.NumberFormat(localeFor(currency), {
    style: "currency",
    currency,
    signDisplay: opts.signDisplay ?? "auto",
    notation: opts.compact ? "compact" : "standard",
    maximumFractionDigits: opts.compact ? 1 : exp,
  }).format(minor / 10 ** exp);
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

/** Minor units → plain decimal string for form inputs ("1234.5" → "1234.50"). */
export function minorToInput(minor: number, currency: string): string {
  const exp = currencyExponent(currency);
  if (exp === 0) return String(minor);
  const s = String(Math.abs(minor)).padStart(exp + 1, "0");
  return `${minor < 0 ? "-" : ""}${s.slice(0, -exp)}.${s.slice(-exp)}`;
}
