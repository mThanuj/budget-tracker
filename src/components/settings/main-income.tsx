"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { callAction, NOT_SENT } from "@/lib/call-action";
import { setMainIncome } from "@/server/actions/settings";

/** Which income starts a pay month in Insights; none means calendar months. */
export function MainIncome({
  value,
  categories,
}: {
  value: string | null;
  categories: { id: string; name: string }[];
}) {
  const [current, setCurrent] = useOptimistic(value ?? "");
  const [pending, startTransition] = useTransition();
  return (
    <div className="grid gap-3">
      <NativeSelect
        aria-label="Main income"
        value={current}
        disabled={pending}
        className="w-full"
        onChange={(e) => {
          const next = e.target.value;
          startTransition(async () => {
            setCurrent(next);
            const result = await callAction(() => setMainIncome(next || null));
            if (result === NOT_SENT) return;
            if (result?.ok)
              toast.success(next ? "Insights now runs from payday to payday" : "Insights now uses calendar months");
            else
              toast.error(
                result?.error ?? Object.values(result?.fieldErrors ?? {})[0] ?? "Something went wrong. Try again.",
              );
          });
        }}
      >
        <NativeSelectOption value="">None: calendar months</NativeSelectOption>
        {categories.map((c) => (
          <NativeSelectOption key={c.id} value={c.id}>
            {c.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <p className="text-sm text-muted-foreground">
        Paid at the end of the month? Choose the category your pay goes in. Insights then runs each month from the day
        it comes in (in the month&rsquo;s last week, or its last working day) to the next, so your pay is set against
        what it pays for. Budgets still reset on the 1st.
      </p>
    </div>
  );
}
