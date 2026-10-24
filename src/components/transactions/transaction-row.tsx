"use client";

import { ArrowLeftRightIcon } from "lucide-react";
import { cn } from "cn";
import { CategoryIcon } from "@/components/categories/category-icon";
import { formatMoney } from "@/lib/money";
import type { TransactionRow } from "@/server/services/transactions";
import { useEntryDialog } from "./entry-dialog";

export function signedAmount(row: Pick<TransactionRow, "type" | "amountMinor">, currency: string) {
  const amount = formatMoney(row.amountMinor, currency);
  if (row.type === "income") return `+${amount}`;
  if (row.type === "expense") return `−${amount}`;
  return amount;
}

/** One passbook line; tapping it opens the entry for editing. */
export function TransactionRowButton({ row, currency }: { row: TransactionRow; currency: string }) {
  const { openEdit } = useEntryDialog();
  const isTransfer = row.type === "transfer";
  const title =
    row.description || (isTransfer ? "Moved money" : (row.categoryName ?? (row.type === "income" ? "Money received" : "Spending")));
  const detail = isTransfer
    ? `${row.walletName} → ${row.toWalletName}`
    : [row.description ? (row.categoryName ?? "No category") : null, row.walletName].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      onClick={() =>
        openEdit({
          id: row.id,
          type: row.type,
          amountMinor: row.amountMinor,
          occurredOn: row.occurredOn,
          description: row.description,
          notes: row.notes,
          walletId: row.walletId,
          toWalletId: row.toWalletId,
          categoryId: row.categoryId,
        })
      }
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted sm:px-5"
    >
      {isTransfer ? (
        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
          <ArrowLeftRightIcon className="size-4" />
        </span>
      ) : (
        <CategoryIcon icon={row.categoryIcon ?? "tag"} color={row.categoryColor} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{detail}</span>
      </span>
      <span
        className={cn(
          "tabular shrink-0 text-right text-sm",
          row.type === "income" && "text-primary",
          isTransfer && "text-muted-foreground",
        )}
      >
        {signedAmount(row, currency)}
      </span>
    </button>
  );
}
