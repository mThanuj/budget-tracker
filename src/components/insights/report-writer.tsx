"use client";

import { RefreshCwIcon } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import type { InsightKind } from "@/lib/insights";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { writeInsight, type WriteInsightResult } from "@/server/actions/insights";
import { callAction, NOT_SENT, NOT_SENT_MESSAGE } from "@/lib/call-action";

const FAILURES: Record<Exclude<WriteInsightResult, { ok: true }>["reason"], string> = {
  pro: "Written reports are part of Pro.",
  disabled: "AI features are switched off in Settings.",
  not_enough: "There aren't enough entries yet for a useful report.",
  refreshes: "You've used this month's rewrites. More next month.",
  limit: "You've used today's AI requests. Try again tomorrow.",
  busy: "The AI is busy right now. Try again in a minute.",
  unreadable: "The report didn't come out right this time. Try again in a minute.",
};

/**
 * Asks the server to write a report. With `auto`, it starts on arrival (the
 * included first report for last month); otherwise it waits for the button.
 * On success the page re-renders with the saved report.
 */
export function ReportWriter({
  kind,
  auto = false,
  label,
  note,
}: {
  kind: InsightKind;
  auto?: boolean;
  label: string;
  note?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  function write() {
    setError(null);
    startTransition(async () => {
      const result = await callAction(() => writeInsight(kind), { notify: false });
      if (result === NOT_SENT) setError(NOT_SENT_MESSAGE);
      else if (!result.ok) setError(FAILURES[result.reason]);
    });
  }

  // The included report starts writing on arrival, once.
  const writeOnArrival = useEffectEvent(() => {
    if (auto && !started.current) {
      started.current = true;
      write();
    }
  });
  useEffect(() => {
    writeOnArrival();
  }, []);

  if (pending) {
    return (
      <div role="status" className="grid gap-3">
        <p className="animate-pulse text-sm text-muted-foreground">Writing your report…</p>
        <Skeleton className="h-6 w-3/4" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      </div>
    );
  }
  return (
    <div className="grid gap-2">
      {error && (
        <p role="alert" className="text-sm text-muted-foreground">
          {error}
        </p>
      )}
      {(!auto || error) && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant={auto ? "outline" : "default"} onClick={write}>
            <RefreshCwIcon aria-hidden />
            {auto ? "Try again" : label}
          </Button>
          {note && <span className="text-sm text-muted-foreground">{note}</span>}
        </div>
      )}
    </div>
  );
}
