"use client";

import { useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { CategoryChips } from "@/components/categories/category-chips";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { FormField, fieldAria } from "@/components/ui-extra/form-field";
import { Segmented } from "@/components/ui-extra/segmented";
import { relativeDay } from "@/lib/date-format";
import { addDays } from "@/lib/dates";
import { minorToInput } from "@/lib/money";
import { type Frequency, occurrenceOnOrAfter, REPEAT_OPTIONS } from "@/lib/recurring";
import { saveRule } from "@/server/actions/recurring";
import { callAction, NOT_SENT, NOT_SENT_MESSAGE } from "@/lib/call-action";
import { useFormAction } from "@/components/ui-extra/use-form-action";

export type RuleFormData = {
  currency: string;
  today: string;
  defaultWalletId: string | null;
  wallets: { id: string; name: string; archived: boolean }[];
  categories: { id: string; name: string; kind: "income" | "expense"; icon: string; color: string; archived: boolean }[];
};

export type EditableRule = {
  id: string;
  type: "income" | "expense" | "transfer";
  amountMinor: number;
  description: string;
  categoryId: string | null;
  walletId: string;
  toWalletId: string | null;
  frequency: Frequency;
  interval: number;
  anchorDate: string;
  endDate: string | null;
  mode: "auto" | "confirm";
  isSubscription: boolean;
};

export type RulePreset = Partial<Pick<EditableRule, "type" | "isSubscription">>;

function RuleForm({ data, rule, preset, onDone }: { data: RuleFormData; rule?: EditableRule; preset?: RulePreset; onDone: () => void }) {
  const [type, setType] = useState(rule?.type ?? preset?.type ?? "expense");
  const [categoryId, setCategoryId] = useState<string | null>(rule?.categoryId ?? null);
  const [repeat, setRepeat] = useState(
    rule ? `${rule.frequency}-${rule.interval}` : "monthly-1",
  );
  const [anchorDate, setAnchorDate] = useState(rule?.anchorDate ?? data.today);
  const [endDate, setEndDate] = useState(rule?.endDate ?? "");
  const [showEnd, setShowEnd] = useState(Boolean(rule?.endDate));
  const [mode, setMode] = useState(rule?.mode ?? "auto");
  const [isSubscription, setIsSubscription] = useState(rule?.isSubscription ?? preset?.isSubscription ?? false);

  const wallets = data.wallets.filter((w) => !w.archived || w.id === rule?.walletId || w.id === rule?.toWalletId);
  const categories = data.categories.filter(
    (c) => c.kind === (type === "income" ? "income" : "expense") && (!c.archived || c.id === rule?.categoryId),
  );
  const firstWallet = data.defaultWalletId ?? wallets[0]?.id ?? "";
  const option = REPEAT_OPTIONS.find((o) => o.value === repeat) ?? REPEAT_OPTIONS[2];
  const first = /^\d{4}-\d{2}-\d{2}$/.test(anchorDate)
    ? occurrenceOnOrAfter(
        { frequency: option.frequency, interval: option.interval, anchorDate, endDate: showEnd && endDate ? endDate : null },
        anchorDate > data.today ? anchorDate : data.today,
      )
    : null;

  const { state, pending, form } = useFormAction(async (prev: Parameters<typeof saveRule>[0], fd: FormData) => {
    // A failed send keeps the form as typed and says so inline.
    const result = await callAction(() => saveRule(prev, fd), { notify: false });
    if (result === NOT_SENT) return { ok: false as const, error: NOT_SENT_MESSAGE };
    if (result?.ok) {
      toast.success(rule ? "Changes saved" : "Recurring item added");
      onDone();
    }
    return result;
  }, undefined);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const isTransfer = type === "transfer";

  return (
    <form {...form} className="grid gap-5">
      {rule && <input type="hidden" name="id" value={rule.id} />}
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="categoryId" value={categoryId ?? ""} />
      <input type="hidden" name="mode" value={mode} />
      {!showEnd && <input type="hidden" name="endDate" value="" />}
      {isSubscription && type === "expense" && <input type="hidden" name="isSubscription" value="on" />}

      <Segmented
        label="Type"
        fill
        value={type}
        onChange={(t) => {
          if ((t === "income") !== (type === "income") || t === "transfer") setCategoryId(null);
          setType(t);
        }}
        options={[
          { value: "expense", label: "Spent" },
          { value: "income", label: "Received" },
          { value: "transfer", label: "Moved" },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <FormField id="rule-name" label="Name" error={errors.description}>
          <Input
            {...fieldAria("rule-name", errors.description)}
            name="description"
            autoFocus
            autoComplete="off"
            maxLength={60}
            placeholder={isTransfer ? "Credit card bill" : type === "income" ? "Salary" : "Rent"}
            defaultValue={rule?.description ?? ""}
            className="h-10"
          />
        </FormField>
        <FormField id="rule-amount" label="Amount" error={errors.amount}>
          <Input
            {...fieldAria("rule-amount", errors.amount)}
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            defaultValue={rule ? minorToInput(rule.amountMinor, data.currency) : ""}
            className="tabular h-10"
          />
        </FormField>
      </div>

      {!isTransfer && (
        <CategoryChips categories={categories} value={categoryId} onChange={setCategoryId} error={errors.categoryId} />
      )}

      <div className={cn("grid gap-4", isTransfer && "sm:grid-cols-2")}>
        <FormField id="rule-wallet" label={isTransfer ? "From" : type === "income" ? "Received in" : "Paid from"} error={errors.walletId}>
          <NativeSelect {...fieldAria("rule-wallet", errors.walletId)} name="walletId" defaultValue={rule?.walletId ?? firstWallet} className="w-full">
            {wallets.map((w) => (
              <NativeSelectOption key={w.id} value={w.id}>
                {w.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        {isTransfer && (
          <FormField id="rule-to-wallet" label="To" error={errors.toWalletId}>
            <NativeSelect
              {...fieldAria("rule-to-wallet", errors.toWalletId)}
              name="toWalletId"
              defaultValue={rule?.toWalletId ?? wallets.find((w) => w.id !== firstWallet)?.id ?? ""}
              className="w-full"
            >
              {wallets.map((w) => (
                <NativeSelectOption key={w.id} value={w.id}>
                  {w.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </FormField>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="rule-repeat" label="Repeats" error={errors.repeat}>
          <NativeSelect {...fieldAria("rule-repeat", errors.repeat)} name="repeat" value={repeat} onChange={(e) => setRepeat(e.target.value)} className="w-full">
            {REPEAT_OPTIONS.map((o) => (
              <NativeSelectOption key={o.value} value={o.value}>
                {o.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="rule-anchor" label="Starting" error={errors.anchorDate}>
          <Input
            {...fieldAria("rule-anchor", errors.anchorDate)}
            type="date"
            name="anchorDate"
            value={anchorDate}
            onChange={(e) => setAnchorDate(e.target.value)}
            className="h-9"
          />
        </FormField>
      </div>

      {showEnd ? (
        <FormField id="rule-end" label="Ends on" error={errors.endDate}>
          <Input
            {...fieldAria("rule-end", errors.endDate)}
            type="date"
            name="endDate"
            min={anchorDate}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="h-9 w-auto"
          />
        </FormField>
      ) : (
        <button
          type="button"
          onClick={() => setShowEnd(true)}
          className="-mt-2 justify-self-start rounded text-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Add an end date (for EMIs and loans)
        </button>
      )}

      <p className="-mt-2 text-sm text-muted-foreground">
        {first
          ? `Past dates aren't added. The first entry will be ${first === data.today || first === addDays(data.today, 1) ? "" : "on "}${relativeDay(first, data.today)}.`
          : "This schedule has no dates left. Check the start and end dates."}
      </p>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">When the date comes</legend>
        <div role="radiogroup" aria-label="When the date comes" className="grid gap-2 sm:grid-cols-2">
          {(
            [
              { value: "auto", label: "Add it automatically", hint: "Best for fixed amounts like rent, salary or subscriptions." },
              { value: "confirm", label: "Ask me first", hint: "For bills that change, like electricity. You confirm the amount." },
            ] as const
          ).map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={mode === o.value}
              onClick={() => setMode(o.value)}
              className={cn(
                "grid gap-0.5 rounded-xl border p-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                mode === o.value ? "border-primary bg-accent" : "border-border hover:bg-muted",
              )}
            >
              <span className="text-sm font-medium">{o.label}</span>
              <span className="text-xs text-muted-foreground">{o.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {type === "expense" && (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3">
          <input
            type="checkbox"
            checked={isSubscription}
            onChange={(e) => setIsSubscription(e.target.checked)}
            className="mt-0.5 size-4 accent-[var(--primary)]"
          />
          <span className="grid gap-0.5">
            <span className="text-sm font-medium">This is a subscription</span>
            <span className="text-sm text-muted-foreground">Streaming, apps, gym… It shows up in your subscription total.</span>
          </span>
        </label>
      )}

      {state && !state.ok && state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pending || !first} className="px-5">
          {pending ? "Saving…" : rule ? "Save changes" : "Add recurring item"}
        </Button>
      </div>
    </form>
  );
}

export function RuleDialog({
  open,
  onOpenChange,
  data,
  rule,
  preset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: RuleFormData;
  rule?: EditableRule;
  preset?: RulePreset;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-5 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{rule ? "Edit recurring item" : "New recurring item"}</DialogTitle>
          <DialogDescription>Rent, salary, EMIs, bills and subscriptions that repeat on a schedule.</DialogDescription>
        </DialogHeader>
        {open && <RuleForm data={data} rule={rule} preset={preset} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
