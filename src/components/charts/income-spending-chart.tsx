"use client";

import { useState } from "react";
import { cn } from "cn";
import { niceTicks } from "@/lib/chart-scale";
import { formatMonth } from "@/lib/date-format";
import { formatMoney } from "@/lib/money";

export type MonthTotals = { month: string; incomeMinor: number; expenseMinor: number };

const SERIES = [
  { key: "incomeMinor", label: "Income", className: "bg-chart-1" },
  { key: "expenseMinor", label: "Spending", className: "bg-chart-2" },
] as const;

const shortMonth = (m: string) => formatMonth(m).slice(0, 3);

/**
 * Income vs spending per month: grouped columns on one axis, a legend, a
 * tooltip on hover or keyboard focus, and a table view with every value.
 */
export function IncomeSpendingChart({
  data,
  currency,
  currentMonth,
}: {
  data: MonthTotals[];
  currency: string;
  currentMonth: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...data.flatMap((d) => [d.incomeMinor, d.expenseMinor]));
  const ticks = niceTicks(max);
  const top = ticks.at(-1) || 1;
  const compact = (v: number) => formatMoney(v, currency, { compact: true });

  if (max === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No income or spending recorded in the last 6 months.</p>;
  }

  return (
    <figure className="grid gap-4">
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground" aria-label="Legend">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span aria-hidden className={cn("size-2.5 rounded-[2px]", s.className)} />
            {s.label}
          </li>
        ))}
      </ul>

      {/* Top padding leaves room for the highest tick label above the plot. */}
      <div className="grid grid-cols-[auto_1fr] gap-x-3 pt-3">
        {/* Y axis ticks */}
        <div aria-hidden className="relative h-48 w-12 text-right">
          {ticks.map((t) => (
            <span
              key={t}
              className="tabular absolute right-0 -translate-y-1/2 text-[0.7rem] text-muted-foreground"
              style={{ bottom: `${(t / top) * 100}%` }}
            >
              {compact(t)}
            </span>
          ))}
        </div>

        {/* Plot */}
        <div className="relative h-48">
          {ticks.map((t) => (
            <span
              key={t}
              aria-hidden
              className={cn("absolute inset-x-0 h-px", t === 0 ? "bg-border" : "bg-chart-grid")}
              style={{ bottom: `${(t / top) * 100}%` }}
            />
          ))}
          <ol className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
            {data.map((d, i) => {
              const sofar = d.month === currentMonth ? " (so far)" : "";
              const left = d.incomeMinor - d.expenseMinor;
              return (
                <li
                  key={d.month}
                  tabIndex={0}
                  aria-label={`${formatMonth(d.month)}${sofar}: income ${formatMoney(d.incomeMinor, currency)}, spending ${formatMoney(d.expenseMinor, currency)}`}
                  onPointerEnter={() => setActive(i)}
                  onPointerLeave={() => setActive((a) => (a === i ? null : a))}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive((a) => (a === i ? null : a))}
                  className="group relative flex h-full items-end justify-center gap-[2px] rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span aria-hidden className={cn("absolute inset-0 rounded-md transition-colors", active === i && "bg-muted/60")} />
                  {SERIES.map((s) => (
                    <span
                      key={s.key}
                      aria-hidden
                      className={cn("relative w-full max-w-6 rounded-t-[4px]", s.className)}
                      style={{ height: `${(d[s.key] / top) * 100}%`, minHeight: d[s.key] > 0 ? 2 : 0 }}
                    />
                  ))}
                  {active === i && (
                    <span
                      role="tooltip"
                      className={cn(
                        "pointer-events-none absolute bottom-full z-10 mb-2 grid w-max min-w-40 gap-1 rounded-lg bg-popover px-3 py-2 text-left text-xs shadow-md ring-1 ring-foreground/10",
                        i < data.length / 2 ? "left-0" : "right-0",
                      )}
                    >
                      <span className="text-muted-foreground">
                        {formatMonth(d.month)}
                        {sofar}
                      </span>
                      {SERIES.map((s) => (
                        <span key={s.key} className="flex items-center gap-2">
                          <span aria-hidden className={cn("h-0.5 w-3 rounded-full", s.className)} />
                          <span className="tabular font-semibold text-foreground">{formatMoney(d[s.key], currency)}</span>
                          <span className="text-muted-foreground">{s.label}</span>
                        </span>
                      ))}
                      <span className="mt-0.5 border-t border-border pt-1 text-muted-foreground">
                        {left >= 0 ? "Left over" : "Overspent"}{" "}
                        <span className="tabular font-semibold text-foreground">{formatMoney(Math.abs(left), currency)}</span>
                      </span>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        {/* X axis */}
        <span aria-hidden />
        <ol aria-hidden className="mt-2 grid text-center text-xs text-muted-foreground" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
          {data.map((d) => (
            <li key={d.month} className={cn(d.month === currentMonth && "font-medium text-foreground")}>
              {shortMonth(d.month)}
            </li>
          ))}
        </ol>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground select-none hover:text-foreground">Show as table</summary>
        <table className="mt-3 w-full text-left">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1.5 font-medium">Month</th>
              <th className="py-1.5 text-right font-medium">Income</th>
              <th className="py-1.5 text-right font-medium">Spending</th>
              <th className="py-1.5 text-right font-medium">Left over</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((d) => (
              <tr key={d.month}>
                <td className="py-1.5">{formatMonth(d.month)}</td>
                <td className="tabular py-1.5 text-right">{formatMoney(d.incomeMinor, currency)}</td>
                <td className="tabular py-1.5 text-right">{formatMoney(d.expenseMinor, currency)}</td>
                <td className="tabular py-1.5 text-right">{formatMoney(d.incomeMinor - d.expenseMinor, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
