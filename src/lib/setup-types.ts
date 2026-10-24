import type { WalletKind } from "./wallets";

// Editable rows in the setup flow. Amounts and days are strings because they
// live in text inputs; the server parses and validates them on apply.

export type WalletRow = { name: string; kind: WalletKind; balance: string };
export type IncomeRow = { name: string; amount: string; day: string };
export type BillRow = { name: string; amount: string; day: string; subscription: boolean; categoryId: string | null };
export type GoalRow = { name: string; target: string; by: string };

export type SetupStep = "wallets" | "incomes" | "bills" | "goals";

export type SetupRows = {
  wallets: WalletRow[];
  incomes: IncomeRow[];
  bills: BillRow[];
  goals: GoalRow[];
};

export const EMPTY_ROW = {
  wallets: (): WalletRow => ({ name: "", kind: "bank", balance: "" }),
  incomes: (): IncomeRow => ({ name: "", amount: "", day: "" }),
  bills: (): BillRow => ({ name: "", amount: "", day: "", subscription: false, categoryId: null }),
  goals: (): GoalRow => ({ name: "", target: "", by: "" }),
} satisfies { [K in SetupStep]: () => SetupRows[K][number] };
