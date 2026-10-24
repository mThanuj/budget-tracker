"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { setAiEnabled } from "@/server/actions/settings";

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
            await setAiEnabled(!on);
            toast.success(on ? "AI features switched off" : "AI features switched on");
          })
        }
        className="inline-flex items-center gap-3 self-start rounded-full text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className={cn("relative h-6 w-11 rounded-full transition-colors", on ? "bg-primary" : "bg-input")}>
          <span
            className={cn(
              "absolute top-0.5 size-5 rounded-full bg-background shadow-sm transition-transform",
              on ? "translate-x-5.5" : "translate-x-0.5",
            )}
          />
        </span>
        {on ? "On" : "Off"}
      </button>
      <p className="text-sm text-muted-foreground">
        When on, the note you type in &ldquo;Type it in words&rdquo; and the descriptions of new entries are sent to our AI
        provider (Groq, Cerebras or OpenRouter) to fill in the form and suggest categories. Your name, email and balances
        are never sent. When off, everything still works; you just fill in forms yourself.
      </p>
    </div>
  );
}
