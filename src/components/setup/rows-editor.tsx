"use client";

import { PlusIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { type BillRow, EMPTY_ROW, type GoalRow, type IncomeRow, type WalletRow } from "@/lib/setup-types";
import { WALLET_KINDS } from "@/lib/wallets";

type Editor<T> = { rows: T[]; onChange: (rows: T[]) => void };

const small = "h-9";
const fieldLabel = "grid gap-1 text-xs text-muted-foreground";
const digits = (v: string) => v.replace(/\D/g, "").slice(0, 2);

/** Shared row list: one card per row with a remove button, and "Add another". */
function RowList<T>({
  rows,
  onChange,
  empty,
  children,
}: Editor<T> & { empty: () => T; children: (row: T, set: (patch: Partial<T>) => void) => ReactNode }) {
  return (
    <div className="grid gap-3">
      {rows.map((row, i) => (
        <div
          key={i}
          className="grid grid-cols-[1fr_auto] items-end gap-2 rounded-xl border border-border bg-card p-3 sm:flex sm:flex-wrap"
        >
          {children(row, (patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r))))}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove row ${i + 1}`}
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
            className="self-end"
          >
            <XIcon />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() => onChange([...rows, empty()])}
        className="justify-self-start"
      >
        <PlusIcon aria-hidden />
        Add {rows.length ? "another" : "one"}
      </Button>
    </div>
  );
}

export function WalletRows(props: Editor<WalletRow>) {
  return (
    <RowList {...props} empty={EMPTY_ROW.wallets}>
      {(w, set) => (
        <>
          <label className={`${fieldLabel} col-span-2 sm:min-w-44 sm:flex-1`}>
            Name
            <Input
              value={w.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="SBI Savings"
              className={small}
            />
          </label>
          <label className={fieldLabel}>
            Type
            <NativeSelect
              value={w.kind}
              onChange={(e) => {
                // Look the value up instead of asserting it: only a listed kind is accepted.
                const kind = WALLET_KINDS.find((k) => k.value === e.target.value)?.value;
                if (kind) set({ kind });
              }}
              className="w-full"
            >
              {WALLET_KINDS.map((k) => (
                <NativeSelectOption key={k.value} value={k.value}>
                  {k.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <label className={`${fieldLabel} sm:w-36`}>
            {w.kind === "credit_card" ? "Owed now" : "Balance now"}
            <Input
              value={w.balance}
              onChange={(e) => set({ balance: e.target.value })}
              inputMode="decimal"
              placeholder="0"
              className={`tabular ${small}`}
            />
          </label>
        </>
      )}
    </RowList>
  );
}

export function IncomeRows(props: Editor<IncomeRow>) {
  return (
    <RowList {...props} empty={EMPTY_ROW.incomes}>
      {(r, set) => (
        <>
          <label className={`${fieldLabel} col-span-2 sm:min-w-44 sm:flex-1`}>
            Name
            <Input
              value={r.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="Salary"
              className={small}
            />
          </label>
          <label className={`${fieldLabel} sm:w-36`}>
            Amount a month
            <Input
              value={r.amount}
              onChange={(e) => set({ amount: e.target.value })}
              inputMode="decimal"
              placeholder="0"
              className={`tabular ${small}`}
            />
          </label>
          <label className={`${fieldLabel} sm:w-24`}>
            Day (1–31)
            <Input
              value={r.day}
              onChange={(e) => set({ day: digits(e.target.value) })}
              inputMode="numeric"
              placeholder="1"
              className={`tabular ${small}`}
            />
          </label>
        </>
      )}
    </RowList>
  );
}

export function BillRows(props: Editor<BillRow> & { expenseCategories: { id: string; name: string }[] }) {
  const { expenseCategories, ...editor } = props;
  return (
    <RowList {...editor} empty={EMPTY_ROW.bills}>
      {(b, set) => (
        <>
          <label className={`${fieldLabel} col-span-2 sm:min-w-40 sm:flex-1`}>
            Name
            <Input
              value={b.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="Rent"
              className={small}
            />
          </label>
          <label className={`${fieldLabel} sm:w-32`}>
            Amount
            <Input
              value={b.amount}
              onChange={(e) => set({ amount: e.target.value })}
              inputMode="decimal"
              placeholder="0"
              className={`tabular ${small}`}
            />
          </label>
          <label className={`${fieldLabel} sm:w-20`}>
            Day
            <Input
              value={b.day}
              onChange={(e) => set({ day: digits(e.target.value) })}
              inputMode="numeric"
              placeholder="—"
              className={`tabular ${small}`}
            />
          </label>
          <label className={`${fieldLabel} col-span-2 sm:w-44`}>
            Category
            <NativeSelect
              value={b.categoryId ?? ""}
              onChange={(e) => set({ categoryId: e.target.value || null })}
              className="w-full"
            >
              <NativeSelectOption value="">No category</NativeSelectOption>
              {expenseCategories.map((c) => (
                <NativeSelectOption key={c.id} value={c.id}>
                  {c.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <label className="flex h-9 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={b.subscription}
              onChange={(e) => set({ subscription: e.target.checked })}
              className="size-4 accent-[var(--primary)]"
            />
            Subscription
          </label>
        </>
      )}
    </RowList>
  );
}

export function GoalRows(props: Editor<GoalRow> & { today: string }) {
  const { today, ...editor } = props;
  return (
    <RowList {...editor} empty={EMPTY_ROW.goals}>
      {(g, set) => (
        <>
          <label className={`${fieldLabel} col-span-2 sm:min-w-44 sm:flex-1`}>
            Saving for
            <Input
              value={g.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="New phone"
              className={small}
            />
          </label>
          <label className={`${fieldLabel} sm:w-36`}>
            Amount needed
            <Input
              value={g.target}
              onChange={(e) => set({ target: e.target.value })}
              inputMode="decimal"
              placeholder="0"
              className={`tabular ${small}`}
            />
          </label>
          <label className={`${fieldLabel} sm:w-40`}>
            By (optional)
            <Input
              type="date"
              min={today}
              value={g.by}
              onChange={(e) => set({ by: e.target.value })}
              className={small}
            />
          </label>
        </>
      )}
    </RowList>
  );
}
