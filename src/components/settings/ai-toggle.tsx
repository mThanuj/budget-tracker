"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { setAiEnabled } from "@/server/actions/settings";
import { callAction, NOT_SENT } from "@/lib/call-action";

export function AiToggle({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useOptimistic(enabled);
  const [pending, startTransition] = useTransition();
  return (
    <div className="grid gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="AI features"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setOn(!on);
            const result = await callAction(() => setAiEnabled(!on));
            if (result !== NOT_SENT) toast.success(on ? "AI features switched off" : "AI features switched on");
          })
        }
        className="inline-flex items-center gap-3 self-start rounded-full text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className={cn("relative h-6 w-11 rounded-full transition-colors", on ? "bg-primary" : "bg-input")}>
          <span
            className={cn(
              "absolute top-0.5 left-0 size-5 rounded-full bg-background shadow-sm transition-transform",
              on ? "translate-x-5.5" : "translate-x-0.5",
            )}
          />
        </span>
        {on ? "On" : "Off"}
      </button>
      <p className="text-sm text-muted-foreground">
        When on, what you type into the AI boxes and the descriptions of new entries are sent to our AI provider (Groq,
        Cerebras or OpenRouter). When you ask a question or read Insights, the amounts needed to answer are sent too:
        totals, category and entry names, budgets and goals. Your name and email are never sent. When off, everything
        else still works; you just fill in forms yourself.
      </p>
    </div>
  );
}
