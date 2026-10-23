"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "cn";
import { formatMoney } from "@/lib/money";

const TYPED = "spent 240 on chai and samosa, paid cash";

type Row = { date: string; detail: string; wallet: string; amount: number };

const NEW_ROW: Row = { date: "24 Oct", detail: "Dining Out", wallet: "Cash", amount: -24000 };
const ROWS: Row[] = [
  { date: "23 Oct", detail: "Salary", wallet: "SBI Debit", amount: 4200000 },
  { date: "22 Oct", detail: "Fuel", wallet: "ICICI Credit Card", amount: -115000 },
  { date: "21 Oct", detail: "Groceries", wallet: "SBI Debit", amount: -238000 },
];
const BALANCE_BEFORE = 3865000;

function subscribeMotion(onChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function useReducedMotion() {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

function Amount({ value }: { value: number }) {
  return (
    <span className={cn("tabular text-right", value > 0 ? "text-primary" : "text-foreground")}>
      {formatMoney(value, "INR", { signDisplay: "always" }).replace("-", "−")}
    </span>
  );
}

function LedgerRow({ row, fresh = false }: { row: Row; fresh?: boolean }) {
  return (
    <li
      className={cn(
        "grid grid-cols-[3.5rem_1fr_6.5rem] items-baseline gap-x-3 border-b border-dashed border-border px-5 py-3 text-sm last:border-b-0 sm:grid-cols-[3.75rem_1fr_9rem_7rem]",
        fresh && "animate-in fade-in-0 slide-in-from-top-2 bg-accent/60 duration-500",
      )}
    >
      <span className="tabular text-xs text-muted-foreground">{row.date}</span>
      <span className="truncate">
        {row.detail}
        <span className="block truncate text-xs text-muted-foreground sm:hidden">{row.wallet}</span>
      </span>
      <span className="hidden truncate text-muted-foreground sm:block">{row.wallet}</span>
      <Amount value={row.amount} />
    </li>
  );
}

/** The landing page's signature: a plain sentence becomes a passbook entry. */
export function PassbookDemo() {
  const reduced = useReducedMotion();
  const [typed, setTyped] = useState(0);
  const [printed, setPrinted] = useState(false);

  useEffect(() => {
    if (reduced) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const start = 700;
    for (let i = 1; i <= TYPED.length; i++) {
      timers.push(setTimeout(() => setTyped(i), start + i * 42));
    }
    timers.push(setTimeout(() => setPrinted(true), start + TYPED.length * 42 + 450));
    return () => timers.forEach(clearTimeout);
  }, [reduced]);

  const showAll = reduced || printed;
  const text = reduced ? TYPED : TYPED.slice(0, typed);
  const balance = showAll ? BALANCE_BEFORE + NEW_ROW.amount : BALANCE_BEFORE;

  return (
    <figure
      aria-label="Example: typing a sentence adds a sorted entry to your passbook"
      className="overflow-hidden rounded-2xl bg-card shadow-[0_1px_0_0_var(--border),0_24px_48px_-24px_rgb(15_110_102/0.25)] ring-1 ring-foreground/10"
    >
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <span aria-hidden className="text-primary">›</span>
        <p className="min-h-5 flex-1 text-sm">
          {text}
          {!showAll && (
            <span aria-hidden className="ml-px inline-block h-4 w-px translate-y-0.5 animate-pulse bg-foreground" />
          )}
        </p>
      </div>

      <div className="grid grid-cols-[3.5rem_1fr_6.5rem] gap-x-3 bg-muted/60 px-5 py-2 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase sm:grid-cols-[3.75rem_1fr_9rem_7rem]">
        <span>Date</span>
        <span>Details</span>
        <span className="hidden sm:block">Wallet</span>
        <span className="text-right">Amount</span>
      </div>

      <ol>
        {showAll && <LedgerRow row={NEW_ROW} fresh={!reduced} />}
        {ROWS.map((r) => (
          <LedgerRow key={r.date} row={r} />
        ))}
      </ol>

      <div className="flex items-baseline justify-between border-t-2 border-double border-border px-5 py-3.5 text-sm">
        <span className="text-muted-foreground">Balance</span>
        <span className="tabular font-medium">{formatMoney(balance, "INR")}</span>
      </div>
    </figure>
  );
}
