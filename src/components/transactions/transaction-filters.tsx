"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { entrySearchQuery, type EntrySearchParams } from "@/lib/entry-search";

type Option = { id: string; name: string };

export type FilterValues = Pick<
  EntrySearchParams,
  "month" | "period" | "from" | "to" | "wallet" | "category" | "type" | "q" | "min" | "max"
>;

const OFF = { month: undefined, period: undefined, from: undefined, to: undefined };
const isDay = (v: string) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v);

export function TransactionFilters({
  values,
  thisMonth,
  wallets,
  expenseCategories,
  incomeCategories,
}: {
  values: FilterValues;
  thisMonth: string;
  wallets: Option[];
  expenseCategories: Option[];
  incomeCategories: Option[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(values.q ?? "");
  const [min, setMin] = useState(values.min ?? "");
  const [max, setMax] = useState(values.max ?? "");
  const dates = values.from || values.to ? "custom" : values.period === "all" ? "all" : "month";
  const [choosing, setChoosing] = useState(dates === "custom");

  // Changing a filter starts again from the latest entries ("Show more" isn't kept).
  function apply(next: Partial<FilterValues>) {
    startTransition(() =>
      router.replace(`/transactions${entrySearchQuery({ ...values, ...next })}`, { scroll: false }),
    );
  }
  const applyAmounts = () => {
    if (min.trim() !== (values.min ?? "") || max.trim() !== (values.max ?? "")) {
      apply({ min: min.trim() || undefined, max: max.trim() || undefined });
    }
  };

  const active = Boolean(values.wallet || values.category || values.type || values.q || values.min || values.max);

  return (
    <div className="grid gap-2" aria-busy={pending}>
      <div className="flex flex-wrap items-center gap-2">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            apply({ q: q.trim() || undefined });
          }}
          className="relative min-w-48 flex-1"
        >
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Search descriptions and notes"
            placeholder="Search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => q.trim() !== (values.q ?? "") && apply({ q: q.trim() || undefined })}
            className="h-9 pl-8"
          />
        </form>
        <NativeSelect
          aria-label="Dates"
          value={choosing ? "custom" : dates}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "custom") return setChoosing(true);
            setChoosing(false);
            apply(v === "all" ? { ...OFF, period: "all" } : { ...OFF, month: values.month ?? thisMonth });
          }}
        >
          <NativeSelectOption value="month">One month</NativeSelectOption>
          <NativeSelectOption value="all">All time</NativeSelectOption>
          <NativeSelectOption value="custom">Choose dates…</NativeSelectOption>
        </NativeSelect>
        <NativeSelect
          aria-label="Wallet"
          value={values.wallet ?? ""}
          onChange={(e) => apply({ wallet: e.target.value || undefined })}
        >
          <NativeSelectOption value="">All wallets</NativeSelectOption>
          {wallets.map((w) => (
            <NativeSelectOption key={w.id} value={w.id}>
              {w.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Category"
          value={values.category ?? ""}
          onChange={(e) => apply({ category: e.target.value || undefined })}
        >
          <NativeSelectOption value="">All categories</NativeSelectOption>
          <NativeSelectOption value="none">No category</NativeSelectOption>
          <NativeSelectOptGroup label="Spending">
            {expenseCategories.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {c.name}
              </NativeSelectOption>
            ))}
          </NativeSelectOptGroup>
          <NativeSelectOptGroup label="Income">
            {incomeCategories.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {c.name}
              </NativeSelectOption>
            ))}
          </NativeSelectOptGroup>
        </NativeSelect>
        <NativeSelect
          aria-label="Type"
          value={values.type ?? ""}
          onChange={(e) => apply({ type: e.target.value || undefined })}
        >
          <NativeSelectOption value="">All types</NativeSelectOption>
          <NativeSelectOption value="expense">Spent</NativeSelectOption>
          <NativeSelectOption value="income">Received</NativeSelectOption>
          <NativeSelectOption value="transfer">Moved</NativeSelectOption>
        </NativeSelect>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            applyAmounts();
          }}
          className="flex items-center gap-1"
        >
          <Input
            inputMode="decimal"
            aria-label="Smallest amount"
            placeholder="Min"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            onBlur={applyAmounts}
            className="h-9 w-20"
          />
          <span aria-hidden className="text-muted-foreground">
            –
          </span>
          <Input
            inputMode="decimal"
            aria-label="Largest amount"
            placeholder="Max"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            onBlur={applyAmounts}
            className="h-9 w-20"
          />
          {/* Enter applies the amounts; the button is for keyboards and screen readers. */}
          <button type="submit" className="sr-only">
            Apply amounts
          </button>
        </form>
        {active && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ("");
              setMin("");
              setMax("");
              const kept = { month: values.month, period: values.period, from: values.from, to: values.to };
              startTransition(() => router.replace(`/transactions${entrySearchQuery(kept)}`, { scroll: false }));
            }}
          >
            <XIcon aria-hidden />
            Clear
          </Button>
        )}
      </div>
      {choosing && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2">
            From
            <Input
              type="date"
              defaultValue={values.from ?? ""}
              onChange={(e) =>
                isDay(e.target.value) && apply({ ...OFF, from: e.target.value || undefined, to: values.to })
              }
              className="h-9 w-40"
            />
          </label>
          <label className="flex items-center gap-2">
            To
            <Input
              type="date"
              defaultValue={values.to ?? ""}
              onChange={(e) =>
                isDay(e.target.value) && apply({ ...OFF, from: values.from, to: e.target.value || undefined })
              }
              className="h-9 w-40"
            />
          </label>
        </div>
      )}
    </div>
  );
}
