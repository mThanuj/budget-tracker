// Some runtimes still report legacy zone IDs (Node lists "Asia/Calcutta").
// Normalize to current IANA names so one place never shows up twice.
const ALIASES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Europe/Kiev": "Europe/Kyiv",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "America/Godthab": "America/Nuuk",
  "Pacific/Enderbury": "Pacific/Kanton",
};

export function normalizeTimeZone(timeZone: string): string {
  return ALIASES[timeZone] ?? timeZone;
}

export function detectTimeZone(): string | null {
  try {
    return normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return null;
  }
}

export type Option = { value: string; label: string };

function utcOffset(timeZone: string, at: Date): string {
  const part = new Intl.DateTimeFormat("en", { timeZone, timeZoneName: "shortOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? "";
}

export function timeZoneLabel(timeZone: string, at: Date = new Date()): string {
  return `${timeZone.replaceAll("_", " ")} (${utcOffset(timeZone, at)})`;
}

export function timeZoneOptions(include: string[] = [], at: Date = new Date()): Option[] {
  const zones = new Set(
    [...Intl.supportedValuesOf("timeZone"), "UTC", ...include].map(normalizeTimeZone),
  );
  return [...zones].sort().map((value) => ({ value, label: timeZoneLabel(value, at) }));
}

const COMMON_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "SAR", "JPY"];

export function currencyOptions(): { common: Option[]; all: Option[] } {
  const names = new Intl.DisplayNames(["en"], { type: "currency" });
  const toOption = (code: string) => ({ value: code, label: `${code} · ${names.of(code)}` });
  return {
    common: COMMON_CURRENCIES.map(toOption),
    all: Intl.supportedValuesOf("currency")
      .filter((c) => !COMMON_CURRENCIES.includes(c))
      .map(toOption),
  };
}
