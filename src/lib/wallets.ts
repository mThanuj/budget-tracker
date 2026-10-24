import { formatMoney } from "./money";

export type WalletKind = "cash" | "bank" | "credit_card" | "other";

export const WALLET_KINDS: { value: WalletKind; label: string; hint: string }[] = [
  { value: "bank", label: "Bank account", hint: "Savings or current account, debit card" },
  { value: "credit_card", label: "Credit card", hint: "Spending here adds to what you owe" },
  { value: "cash", label: "Cash", hint: "Notes and coins in your pocket" },
  { value: "other", label: "Other", hint: "UPI wallet, prepaid card, anything else" },
];

export const WALLET_KIND_LABEL: Record<WalletKind, string> = Object.fromEntries(
  WALLET_KINDS.map((k) => [k.value, k.label]),
) as Record<WalletKind, string>;

export const DEFAULT_WALLET_COLOR: Record<WalletKind, string> = {
  cash: "#3f9b74",
  bank: "#4a7fc1",
  credit_card: "#8a64b8",
  other: "#cc7a3e",
};

/**
 * Plain-language balance for a wallet. Credit cards read as "owed" rather than
 * showing a negative number, which beginners find confusing.
 */
export function describeBalance(kind: WalletKind, balanceMinor: number, currency: string) {
  if (kind === "credit_card") {
    if (balanceMinor < 0) return { label: "Owed", amount: formatMoney(-balanceMinor, currency), tone: "owed" as const };
    if (balanceMinor > 0) return { label: "Credit", amount: formatMoney(balanceMinor, currency), tone: "positive" as const };
    return { label: "Nothing owed", amount: formatMoney(0, currency), tone: "neutral" as const };
  }
  return {
    label: "Balance",
    amount: formatMoney(balanceMinor, currency),
    tone: balanceMinor < 0 ? ("owed" as const) : ("neutral" as const),
  };
}
