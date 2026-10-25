"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { FormField, fieldAria } from "@/components/ui-extra/form-field";
import { formatMoney, minorToInput } from "@/lib/money";
import { saveBudget } from "@/server/actions/budgets";
import { callAction, NOT_SENT, NOT_SENT_MESSAGE } from "@/lib/call-action";

export type BudgetTarget =
  | { mode: "overall"; budget?: { id: string; amountMinor: number } }
  | {
      mode: "category";
      budget?: { id: string; amountMinor: number; rollover: boolean; categoryId: string; categoryName: string };
    };

type CategoryOption = { id: string; name: string; icon: string; color: string };

function BudgetForm({
  target,
  categories,
  suggestions,
  currency,
  onDone,
}: {
  target: BudgetTarget;
  categories: CategoryOption[];
  suggestions: Record<string, number>; // categoryId or "overall" → suggested minor units
  currency: string;
  onDone: () => void;
}) {
  const existing = target.budget;
  const [categoryId, setCategoryId] = useState(
    target.mode === "category" ? (target.budget?.categoryId ?? categories[0]?.id ?? "") : "",
  );
  const [amount, setAmount] = useState(existing ? minorToInput(existing.amountMinor, currency) : "");
  const [rollover, setRollover] = useState(target.mode === "category" && Boolean(target.budget?.rollover));
  const suggestion = suggestions[target.mode === "overall" ? "overall" : categoryId];

  const [state, formAction, pending] = useActionState(async (prev: Parameters<typeof saveBudget>[0], fd: FormData) => {
    // A failed send keeps the form as typed and says so inline.
    const result = await callAction(() => saveBudget(prev, fd), { notify: false });
    if (result === NOT_SENT) return { ok: false as const, error: NOT_SENT_MESSAGE };
    if (result?.ok) {
      toast.success(existing ? "Budget updated" : "Budget added");
      onDone();
    }
    return result;
  }, undefined);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  if (target.mode === "category" && !existing && categories.length === 0) {
    return <p className="text-muted-foreground">Every spending category already has a budget.</p>;
  }

  return (
    <form action={formAction} className="grid gap-5">
      {existing && <input type="hidden" name="id" value={existing.id} />}
      <input type="hidden" name="categoryId" value={categoryId} />
      {rollover && <input type="hidden" name="rollover" value="on" />}

      {target.mode === "category" &&
        (existing ? (
          <p className="text-sm">
            Budget for <span className="font-medium">{target.budget?.categoryName}</span>
          </p>
        ) : (
          <FormField id="budget-category" label="Category" error={errors.categoryId}>
            <NativeSelect
              {...fieldAria("budget-category", errors.categoryId)}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full"
            >
              {categories.map((c) => (
                <NativeSelectOption key={c.id} value={c.id}>
                  {c.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </FormField>
        ))}

      <FormField
        id="budget-amount"
        label={target.mode === "overall" ? "How much can you spend in a month?" : "Monthly limit"}
        error={errors.amount}
      >
        <Input
          {...fieldAria("budget-amount", errors.amount)}
          name="amount"
          inputMode="decimal"
          autoComplete="off"
          autoFocus
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="tabular h-11 text-lg md:text-lg"
        />
      </FormField>

      {suggestion ? (
        <div className="-mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-muted/70 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            You spent about {formatMoney(suggestion, currency)} a month {target.mode === "overall" ? "in total" : "here"} recently.
          </span>
          <Button type="button" size="sm" variant="secondary" onClick={() => setAmount(minorToInput(suggestion, currency))}>
            Use this
          </Button>
        </div>
      ) : (
        !existing && (
          <p className="-mt-2 text-sm text-muted-foreground">
            Not sure? Pick a rough number. You can change it any time.
          </p>
        )
      )}

      {target.mode === "category" && (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3">
          <input
            type="checkbox"
            checked={rollover}
            onChange={(e) => setRollover(e.target.checked)}
            className="mt-0.5 size-4 accent-[var(--primary)]"
          />
          <span className="grid gap-0.5">
            <span className="text-sm font-medium">Carry leftovers into next month</span>
            <span className="text-sm text-muted-foreground">
              Unspent money adds to next month&apos;s limit. Overspending takes it off.
              {existing && " Changing the amount starts the count again from this month."}
            </span>
          </span>
        </label>
      )}

      {state && !state.ok && state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pending} className="px-5">
          {pending ? "Saving…" : existing ? "Save changes" : "Add budget"}
        </Button>
      </div>
    </form>
  );
}

export function BudgetDialog({
  open,
  onOpenChange,
  target,
  categories,
  suggestions,
  currency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: BudgetTarget;
  categories: CategoryOption[];
  suggestions: Record<string, number>;
  currency: string;
}) {
  const title =
    target.mode === "overall"
      ? target.budget ? "Edit monthly limit" : "Set a monthly limit"
      : target.budget ? "Edit budget" : "Add a budget";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{title}</DialogTitle>
          <DialogDescription>
            {target.mode === "overall"
              ? "One number for all your spending in a month, so you always know what's left."
              : "A limit for one category. You'll get a heads-up at 80%."}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <BudgetForm
            target={target}
            categories={categories}
            suggestions={suggestions}
            currency={currency}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
