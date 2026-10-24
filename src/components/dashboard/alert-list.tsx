"use client";

import { CalendarClockIcon, OctagonAlertIcon, PartyPopperIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { dismissAlert } from "@/server/actions/alerts";
import type { Alert } from "@/server/services/alerts";

const TONE = {
  info: { Icon: CalendarClockIcon, className: "text-muted-foreground", ring: "ring-foreground/10" },
  warning: { Icon: TriangleAlertIcon, className: "text-warning", ring: "ring-[color-mix(in_oklab,var(--warning)_35%,transparent)]" },
  over: { Icon: OctagonAlertIcon, className: "text-destructive", ring: "ring-[color-mix(in_oklab,var(--destructive)_35%,transparent)]" },
  success: { Icon: PartyPopperIcon, className: "text-primary", ring: "ring-[color-mix(in_oklab,var(--primary)_30%,transparent)]" },
} as const;

const COLLAPSED = 2;

export function AlertList({ alerts }: { alerts: Alert[] }) {
  const [visible, hide] = useOptimistic(alerts, (current, key: string) => current.filter((a) => a.key !== key));
  const [expanded, setExpanded] = useState(false);
  const [, startTransition] = useTransition();
  if (visible.length === 0) return null;
  // A few at a time keeps the page's main number in view on small screens.
  const shown = expanded ? visible : visible.slice(0, COLLAPSED);
  const hidden = visible.length - shown.length;

  return (
    <div className="grid gap-2">
      <ul aria-label="Alerts" className="grid gap-2">
        {shown.map((a) => {
          const { Icon, className, ring } = TONE[a.tone];
          return (
            <li key={a.key} className={cn("flex items-start gap-3 rounded-xl bg-card px-4 py-3 ring-1", ring)}>
              <Icon className={cn("mt-0.5 size-5 shrink-0", className)} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{a.title}</p>
                <p className="text-sm text-muted-foreground">
                  {a.body}{" "}
                  <Link href={a.href} className="text-primary underline-offset-4 hover:underline">
                    View
                  </Link>
                </p>
              </div>
              <button
                type="button"
                aria-label={`Dismiss: ${a.title}`}
                onClick={() =>
                  startTransition(async () => {
                    hide(a.key);
                    const result = await dismissAlert(a.key);
                    if (!result?.ok) toast.error("Couldn't dismiss that. Try again.");
                  })
                }
                className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <XIcon className="size-4" />
              </button>
            </li>
          );
        })}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="justify-self-start rounded text-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Show {hidden} more {hidden === 1 ? "alert" : "alerts"}
        </button>
      )}
    </div>
  );
}
