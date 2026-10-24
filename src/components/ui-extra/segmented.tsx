"use client";

import type { ReactNode } from "react";
import { cn } from "cn";

/** A row of mutually exclusive options (radio group), styled as a pill. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  fill = false,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
  className?: string;
  fill?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex gap-1 rounded-xl bg-muted p-1", fill && "flex w-full", className)}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              fill && "flex-1",
              selected
                ? "bg-card font-medium text-foreground shadow-sm ring-1 ring-foreground/10"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
