"use client";

import { cn } from "cn";
import { CategoryIcon } from "./category-icon";

type Chip = { id: string; name: string; icon: string; color: string };

/** Pick-one category chips; tapping the selected chip clears it (category is optional). */
export function CategoryChips({
  categories,
  value,
  onChange,
  error,
}: {
  categories: Chip[];
  value: string | null;
  onChange: (id: string | null) => void;
  error?: string;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">
        Category <span className="font-normal text-muted-foreground">(optional)</span>
      </legend>
      <div role="radiogroup" aria-label="Category" className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto p-0.5">
        {categories.map((c) => {
          const selected = c.id === value;
          return (
            <button
              key={c.id}
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
