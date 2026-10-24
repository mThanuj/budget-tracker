"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";

type Option = { id: string; name: string };

export type FilterValues = { wallet?: string; category?: string; type?: string; q?: string };

export function TransactionFilters({
  month,
  values,
  wallets,
  expenseCategories,
  incomeCategories,
}: {
  month: string;
  values: FilterValues;
  wallets: Option[];
  expenseCategories: Option[];
  incomeCategories: Option[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(values.q ?? "");

  function apply(next: FilterValues) {
    const params = new URLSearchParams({ month });
    for (const [k, v] of Object.entries({ ...values, ...next })) if (v) params.set(k, v);
    startTransition(() => router.replace(`${pathname}?${params}`, { scroll: false }));
  }

  const active = Boolean(values.wallet || values.category || values.type || values.q);

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          apply({ q: q.trim() || undefined });
        }}
        className="relative min-w-48 flex-1"
      >
        <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
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
      <NativeSelect aria-label="Wallet" value={values.wallet ?? ""} onChange={(e) => apply({ wallet: e.target.value || undefined })}>
        <NativeSelectOption value="">All wallets</NativeSelectOption>
        {wallets.map((w) => (
          <NativeSelectOption key={w.id} value={w.id}>
            {w.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <NativeSelect aria-label="Category" value={values.category ?? ""} onChange={(e) => apply({ category: e.target.value || undefined })}>
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
      <NativeSelect aria-label="Type" value={values.type ?? ""} onChange={(e) => apply({ type: e.target.value || undefined })}>
        <NativeSelectOption value="">All types</NativeSelectOption>
        <NativeSelectOption value="expense">Spent</NativeSelectOption>
        <NativeSelectOption value="income">Received</NativeSelectOption>
        <NativeSelectOption value="transfer">Moved</NativeSelectOption>
      </NativeSelect>
      {active && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            startTransition(() => router.replace(`${pathname}?month=${month}`, { scroll: false }));
          }}
        >
          <XIcon aria-hidden />
          Clear
        </Button>
      )}
    </div>
  );
}
