import { CircleCheckIcon, OctagonAlertIcon, TriangleAlertIcon } from "lucide-react";
import { cn } from "cn";
import type { BudgetLevel } from "@/lib/budgets";

const FILL: Record<BudgetLevel, string> = {
  ok: "bg-primary",
  warning: "bg-warning",
  over: "bg-destructive",
};

// The unfilled track is a lighter step of the same hue, so the state reads
// across the whole bar.
const TRACK: Record<BudgetLevel, string> = {
  ok: "bg-[color-mix(in_oklab,var(--primary)_14%,transparent)]",
  warning: "bg-[color-mix(in_oklab,var(--warning)_18%,transparent)]",
  over: "bg-[color-mix(in_oklab,var(--destructive)_18%,transparent)]",
};

/** A progress meter (spent vs available, saved vs target). */
export function Meter({
  ratio,
  level = "ok",
  label,
  valueText,
  className,
}: {
  ratio: number;
  level?: BudgetLevel;
  label: string;
  valueText: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(ratio, 1)) * 100;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.min(ratio, 1) * 100)}
      aria-valuetext={valueText}
      className={cn("h-2 w-full overflow-hidden rounded-full", TRACK[level], className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-500", FILL[level])} style={{ width: `${pct}%` }} />
    </div>
  );
}

const STATUS = {
  ok: { Icon: CircleCheckIcon, label: "On track", tone: "text-muted-foreground" },
  warning: { Icon: TriangleAlertIcon, label: "Almost used up", tone: "text-warning" },
  over: { Icon: OctagonAlertIcon, label: "Over budget", tone: "text-destructive" },
} as const;

/** Status is never color alone: icon + words. */
export function BudgetStatus({ level, className }: { level: BudgetLevel; className?: string }) {
  const { Icon, label, tone } = STATUS[level];
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", tone, className)}>
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}
