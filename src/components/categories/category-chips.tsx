"use client";

import { SparklesIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "cn";
import { CategoryIcon } from "./category-icon";

type Chip = { id: string; name: string; icon: string; color: string };

/** Pick-one category chips; tapping the selected chip clears it (category is optional). */
export function CategoryChips({
  categories,
  value,
  onChange,
  suggestedId = null,
  error,
}: {
  categories: Chip[];
  value: string | null;
  onChange: (id: string | null) => void;
  /** Marks a chip the app picked, so the user knows to double-check it. */
  suggestedId?: string | null;
  error?: string;
}) {
  const list = useRef<HTMLDivElement>(null);
  // Bring a suggested chip into view; it may be below the fold of the chip box.
  useEffect(() => {
    if (!suggestedId) return;
    list.current?.querySelector(`[data-id="${suggestedId}"]`)?.scrollIntoView({ block: "nearest" });
  }, [suggestedId]);

  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">
        Category{" "}
        <span className="font-normal text-muted-foreground">
          {suggestedId && suggestedId === value ? "· suggested, tap another to change" : "(optional)"}
        </span>
      </legend>
      <div
        ref={list}
        role="radiogroup"
        aria-label="Category"
        className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto p-0.5"
      >
        {categories.map((c) => {
          const selected = c.id === value;
          return (
            <button
              key={c.id}
              data-id={c.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(selected ? null : c.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                selected ? "border-primary bg-accent text-accent-foreground" : "border-border hover:bg-muted",
              )}
            >
              <CategoryIcon icon={c.icon} color={c.color} size="sm" />
              {c.name}
              {c.id === suggestedId && selected && (
                <SparklesIcon className="size-3.5 text-primary" aria-label="Suggested" />
              )}
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
