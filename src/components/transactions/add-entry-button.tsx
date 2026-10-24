"use client";

import { PlusIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { useEntryDialog } from "./entry-dialog";
import type { EntryPreset } from "./transaction-form";

export function AddEntryButton({
  label = "Add entry",
  preset,
  variant = "default",
  className,
}: {
  label?: string;
  preset?: EntryPreset;
  variant?: "default" | "outline" | "secondary";
  className?: string;
}) {
  const { openNew } = useEntryDialog();
  return (
    <Button variant={variant} onClick={() => openNew(preset)} className={className}>
      <PlusIcon aria-hidden />
      {label}
    </Button>
  );
}

/** The round "+" in the middle of the mobile bottom bar. */
export function AddEntryFab({ className }: { className?: string }) {
  const { openNew } = useEntryDialog();
  return (
    <button
      type="button"
      onClick={() => openNew()}
      aria-label="Add entry"
      className={cn(
        "grid size-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_6px_16px_-4px_rgb(15_110_102/0.5)] transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95",
        className,
      )}
    >
      <PlusIcon className="size-6" aria-hidden />
    </button>
  );
}
