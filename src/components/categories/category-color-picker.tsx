"use client";

import { ShuffleIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";

/**
 * Colors for a category: the suggestions look different from the other
 * categories of its kind (D-028), and Shuffle offers new ones.
 */
export function CategoryColorPicker({
  value,
  options,
  onChange,
  onShuffle,
}: {
  value: string;
  options: readonly string[];
  onChange: (color: string) => void;
  onShuffle: () => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">Color</legend>
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Color" className="flex flex-wrap gap-2">
          {options.map((c) => (
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
        <Button type="button" variant="ghost" size="sm" onClick={onShuffle}>
          <ShuffleIcon aria-hidden />
          Shuffle
        </Button>
      </div>
    </fieldset>
  );
}
