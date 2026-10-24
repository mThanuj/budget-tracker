"use client";

import { cn } from "cn";
import { CATEGORY_ICONS } from "@/components/categories/category-icon";
import { CATEGORY_ICON_NAMES, SWATCHES } from "@/lib/category-icons";

export function IconPicker({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">Icon</legend>
      <div role="radiogroup" aria-label="Icon" className="grid grid-cols-7 gap-1.5 sm:grid-cols-9">
        {CATEGORY_ICON_NAMES.map((name) => {
          const Icon = CATEGORY_ICONS[name];
          return (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={value === name}
              aria-label={name.replaceAll("-", " ")}
              onClick={() => onChange(name)}
              className={cn(
                "grid aspect-square place-items-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                value === name && "bg-accent text-accent-foreground ring-1 ring-primary",
              )}
            >
              <Icon className="size-4" aria-hidden />
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">Color</legend>
      <div role="radiogroup" aria-label="Color" className="flex flex-wrap gap-2">
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value === c}
            aria-label={c}
            onClick={() => onChange(c)}
            className={cn(
              "size-7 rounded-full outline-none ring-offset-2 ring-offset-popover focus-visible:ring-3 focus-visible:ring-ring/50",
              value === c && "ring-2 ring-foreground",
            )}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </fieldset>
  );
}
