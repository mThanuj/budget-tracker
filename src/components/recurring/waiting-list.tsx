"use client";

import { ArrowLeftRightIcon, BellRingIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CategoryIcon } from "@/components/categories/category-icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FormField, fieldAria } from "@/components/ui-extra/form-field";
import { relativeDay } from "@/lib/date-format";
import { formatMoney, minorToInput } from "@/lib/money";
import { confirmDue, ruleAction } from "@/server/actions/recurring";
import { callAction, NOT_SENT, NOT_SENT_MESSAGE } from "@/lib/call-action";
import { useFormAction } from "@/components/ui-extra/use-form-action";

export type WaitingItem = {
  ruleId: string;
  description: string;
  type: "income" | "expense" | "transfer";
  amountMinor: number;
  dueOn: string;
  pendingCount: number;
  walletName: string;
  categoryIcon: string | null;
  categoryColor: string | null;
};

function RecordForm({
  item,
  currency,
  today,
  onDone,
}: {
  item: WaitingItem;
  currency: string;
  today: string;
  onDone: () => void;
}) {
  const { state, pending, form } = useFormAction(async (prev: Parameters<typeof confirmDue>[0], fd: FormData) => {
    // A failed send keeps the form as typed and says so inline.
    const result = await callAction(() => confirmDue(prev, fd), { notify: false });
    if (result === NOT_SENT) return { ok: false as const, error: NOT_SENT_MESSAGE };
    if (result?.ok) {
      toast.success(`${item.description} recorded`);
      onDone();
    }
    return result;
  }, undefined);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form {...form} className="grid gap-5">
      <input type="hidden" name="ruleId" value={item.ruleId} />
      <FormField
        id="due-amount"
        label="Amount"
        hint="Change it if this time's amount was different."
        error={errors.amount}
      >
        <Input
          {...fieldAria("due-amount", errors.amount, true)}
          name="amount"
          inputMode="decimal"
          autoComplete="off"
          autoFocus
          defaultValue={minorToInput(item.amountMinor, currency)}
          className="tabular h-11 text-lg md:text-lg"
        />
      </FormField>
      <FormField id="due-date" label="Paid on" error={errors.occurredOn}>
        <Input
          {...fieldAria("due-date", errors.occurredOn)}
          type="date"
          name="occurredOn"
          max={today}
          defaultValue={item.dueOn <= today ? item.dueOn : today}
          className="h-9 w-auto"
        />
      </FormField>
      {state && !state.ok && state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pending} className="px-5">
          {pending ? "Saving…" : "Record it"}
        </Button>
      </div>
    </form>
  );
}

function WaitingRow({ item, currency, today }: { item: WaitingItem; currency: string; today: string }) {
  const [recording, setRecording] = useState(false);
  const [skipping, setSkipping] = useState(false);
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
      {item.type === "transfer" ? (
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
        >
          <ArrowLeftRightIcon className="size-4" />
        </span>
      ) : (
        <CategoryIcon icon={item.categoryIcon ?? "receipt"} color={item.categoryColor} />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{item.description}</p>
        <p className="text-xs text-muted-foreground">
          Due {relativeDay(item.dueOn, today)} · usually {formatMoney(item.amountMinor, currency)} · {item.walletName}
          {item.pendingCount > 1 && ` · ${item.pendingCount - 1} more after this`}
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={skipping}
          onClick={async () => {
            setSkipping(true);
            const result = await callAction(() => ruleAction("skip", item.ruleId));
            setSkipping(false);
            if (result === NOT_SENT) return;
            if (result?.ok) toast.success(`Skipped ${item.description} this time`);
            else toast.error(result?.error ?? "Couldn't skip it. Try again.");
          }}
        >
          Skip
        </Button>
        <Button size="sm" onClick={() => setRecording(true)}>
          Record
        </Button>
      </div>
      <Dialog open={recording} onOpenChange={setRecording}>
        <DialogContent className="gap-5 p-5 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">{item.description}</DialogTitle>
            <DialogDescription>Due {relativeDay(item.dueOn, today)}. Record what you actually paid.</DialogDescription>
          </DialogHeader>
          {recording && <RecordForm item={item} currency={currency} today={today} onDone={() => setRecording(false)} />}
        </DialogContent>
      </Dialog>
    </li>
  );
}

/** "Ask me first" items whose date has come. */
export function WaitingList({ items, currency, today }: { items: WaitingItem[]; currency: string; today: string }) {
  if (items.length === 0) return null;
  return (
    <section
      aria-labelledby="waiting-title"
      className="overflow-hidden rounded-2xl bg-card ring-1 ring-[color-mix(in_oklab,var(--primary)_30%,transparent)]"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border px-4 py-3 sm:px-5">
        <h2 id="waiting-title" className="flex items-center gap-2 self-center font-medium">
          <BellRingIcon className="size-4 text-primary" aria-hidden />
          Waiting for you
        </h2>
        <p className="text-sm text-muted-foreground">Confirm the amount to record it.</p>
      </div>
      <ul className="divide-y divide-dashed divide-border">
        {items.map((i) => (
          <WaitingRow key={i.ruleId} item={i} currency={currency} today={today} />
        ))}
      </ul>
    </section>
  );
}
