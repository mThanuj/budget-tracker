"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CategoryIcon } from "@/components/categories/category-icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField, fieldAria } from "@/components/ui-extra/form-field";
import { ColorPicker, IconPicker } from "@/components/ui-extra/pickers";
import { Segmented } from "@/components/ui-extra/segmented";
import { SWATCHES } from "@/lib/category-icons";
import { formatMoney, minorToInput } from "@/lib/money";
import { saveContribution, saveGoal } from "@/server/actions/goals";
import { callAction, NOT_SENT, NOT_SENT_MESSAGE } from "@/lib/call-action";
import { useFormAction } from "@/components/ui-extra/use-form-action";

export type EditableGoal = {
  id: string;
  name: string;
  targetMinor: number;
  targetDate: string | null;
  icon: string;
  color: string;
};

function useSave<T extends (prev: Parameters<typeof saveGoal>[0], fd: FormData) => ReturnType<typeof saveGoal>>(
  action: T,
  success: string,
  onDone: () => void,
) {
  return useFormAction(async (prev: Parameters<T>[0], fd: FormData) => {
    // A failed send keeps the form as typed and says so inline.
    const result = await callAction(() => action(prev, fd), { notify: false });
    if (result === NOT_SENT) return { ok: false as const, error: NOT_SENT_MESSAGE };
    if (result?.ok) {
      toast.success(success);
      onDone();
    }
    return result;
  }, undefined);
}

function GoalForm({ goal, currency, today, onDone }: { goal?: EditableGoal; currency: string; today: string; onDone: () => void }) {
  const [icon, setIcon] = useState(goal?.icon ?? "piggy-bank");
  const [color, setColor] = useState<string>(goal?.color ?? SWATCHES[2]);
  const { state, pending, form } = useSave(saveGoal, goal ? "Goal updated" : "Goal added", onDone);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form {...form} className="grid gap-5">
      {goal && <input type="hidden" name="id" value={goal.id} />}
      <input type="hidden" name="icon" value={icon} />
      <input type="hidden" name="color" value={color} />

      <div className="flex items-end gap-3">
        <CategoryIcon icon={icon} color={color} size="lg" />
        <FormField id="goal-name" label="What are you saving for?" error={errors.name} className="flex-1">
          <Input
            {...fieldAria("goal-name", errors.name)}
            name="name"
            autoFocus
            autoComplete="off"
            maxLength={40}
            placeholder="New laptop"
            defaultValue={goal?.name ?? ""}
            className="h-10"
          />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="goal-target" label="Amount needed" error={errors.target}>
          <Input
            {...fieldAria("goal-target", errors.target)}
            name="target"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            defaultValue={goal ? minorToInput(goal.targetMinor, currency) : ""}
            className="tabular h-10"
          />
        </FormField>
        <FormField id="goal-date" label="By when? (optional)" error={errors.targetDate}>
          <Input
            {...fieldAria("goal-date", errors.targetDate)}
            type="date"
            name="targetDate"
            min={today}
            defaultValue={goal?.targetDate ?? ""}
            className="h-10"
          />
        </FormField>
      </div>

      <IconPicker value={icon} onChange={setIcon} />
      <ColorPicker value={color} onChange={setColor} />

      {state && !state.ok && state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pending} className="px-5">
          {pending ? "Saving…" : goal ? "Save changes" : "Add goal"}
        </Button>
      </div>
    </form>
  );
}

export function GoalDialog({
  open,
  onOpenChange,
  goal,
  currency,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal?: EditableGoal;
  currency: string;
  today: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{goal ? "Edit goal" : "New goal"}</DialogTitle>
          <DialogDescription>
            {goal ? "Change the name, amount or date." : "Add a date and we'll tell you how much to save each month."}
          </DialogDescription>
        </DialogHeader>
        {open && <GoalForm goal={goal} currency={currency} today={today} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ContributionForm({
  goal,
  savedMinor,
  direction: initial,
  currency,
  today,
  onDone,
}: {
  goal: EditableGoal;
  savedMinor: number;
  direction: "add" | "withdraw";
  currency: string;
  today: string;
  onDone: () => void;
}) {
  const [direction, setDirection] = useState(initial);
  const { state, pending, form } = useSave(
    saveContribution,
    direction === "add" ? `Added to ${goal.name}` : `Taken out of ${goal.name}`,
    onDone,
  );
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form {...form} className="grid gap-5">
      <input type="hidden" name="goalId" value={goal.id} />
      <input type="hidden" name="direction" value={direction} />
      <Segmented
        label="Add or take out"
        fill
        value={direction}
        onChange={setDirection}
        options={[
          { value: "add", label: "Add money" },
          { value: "withdraw", label: "Take out" },
        ]}
      />
      <FormField
        id="contribution-amount"
        label="Amount"
        hint={direction === "withdraw" ? `${formatMoney(savedMinor, currency)} is saved for this goal.` : undefined}
        error={errors.amount}
      >
        <Input
          {...fieldAria("contribution-amount", errors.amount, direction === "withdraw")}
          name="amount"
          inputMode="decimal"
          autoComplete="off"
          autoFocus
          placeholder="0"
          className="tabular h-11 text-lg md:text-lg"
        />
      </FormField>
      <FormField id="contribution-date" label="Date" error={errors.occurredOn}>
        <Input
          {...fieldAria("contribution-date", errors.occurredOn)}
          type="date"
          name="occurredOn"
          max={today}
          defaultValue={today}
          className="h-9 w-auto"
        />
      </FormField>
      <FormField id="contribution-note" label="Note (optional)" error={errors.note}>
        <Textarea {...fieldAria("contribution-note", errors.note)} name="note" maxLength={200} rows={2} />
      </FormField>
      <p className="text-sm text-muted-foreground">
        This sets money aside on paper. Your wallet balances don&apos;t change.
      </p>
      {state && !state.ok && state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pending} className="px-5">
          {pending ? "Saving…" : direction === "add" ? "Add money" : "Take out"}
        </Button>
      </div>
    </form>
  );
}

export function ContributionDialog({
  open,
  onOpenChange,
  ...props
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: EditableGoal;
  savedMinor: number;
  direction: "add" | "withdraw";
  currency: string;
  today: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{props.goal.name}</DialogTitle>
          <DialogDescription className="sr-only">Add money to this goal or take some out.</DialogDescription>
        </DialogHeader>
        {open && <ContributionForm {...props} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
