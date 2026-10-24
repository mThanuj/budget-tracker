"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { CategoryIcon } from "@/components/categories/category-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui-extra/confirm-dialog";
import { FormField, fieldAria } from "@/components/ui-extra/form-field";
import { Segmented } from "@/components/ui-extra/segmented";
import { addDays } from "@/lib/dates";
import { minorToInput } from "@/lib/money";
import type { EntryFormData } from "@/server/actions/entry-form";
import { removeTransaction, saveTransaction } from "@/server/actions/transactions";

export type EntryType = "expense" | "income" | "transfer";

export type EditableEntry = {
  id: string;
  type: EntryType;
  amountMinor: number;
  occurredOn: string;
  description: string;
  notes: string | null;
  walletId: string;
  toWalletId: string | null;
  categoryId: string | null;
};

export type EntryPreset = { type?: EntryType; walletId?: string };

function currencySymbol(currency: string) {
  return (
    new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? currency
  );
}

export function TransactionForm({
  data,
  entry,
  preset,
  onDone,
}: {
  data: EntryFormData;
  entry?: EditableEntry;
  preset?: EntryPreset;
  onDone: () => void;
}) {
  const [type, setType] = useState<EntryType>(entry?.type ?? preset?.type ?? "expense");
  const [categoryId, setCategoryId] = useState<string | null>(entry?.categoryId ?? null);
  const [date, setDate] = useState(entry?.occurredOn ?? data.today);
  const [showNotes, setShowNotes] = useState(Boolean(entry?.notes));
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Archived wallets/categories only appear if this entry already uses them.
  const wallets = data.wallets.filter((w) => !w.archived || w.id === entry?.walletId || w.id === entry?.toWalletId);
  const categories = data.categories.filter(
    (c) => c.kind === (type === "income" ? "income" : "expense") && (!c.archived || c.id === entry?.categoryId),
  );
  const firstWallet = preset?.walletId ?? data.defaultWalletId ?? wallets[0]?.id ?? "";
  const otherWallet = wallets.find((w) => w.id !== firstWallet)?.id ?? "";

  const [state, formAction, pending] = useActionState(async (prev: Parameters<typeof saveTransaction>[0], fd: FormData) => {
    const result = await saveTransaction(prev, fd);
    if (result?.ok) {
      toast.success(entry ? "Changes saved" : "Entry saved");
      onDone();
    }
    return result;
  }, undefined);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  function changeType(next: EntryType) {
    // A category only makes sense for its own kind.
    if ((next === "income") !== (type === "income") || next === "transfer") setCategoryId(null);
    setType(next);
  }

  if (wallets.length === 0) {
    return (
      <p className="text-muted-foreground">
        Add a wallet first, such as Cash or your bank account, then come back to add entries.
      </p>
    );
  }

  const isTransfer = type === "transfer";
  const yesterday = addDays(data.today, -1);

  return (
    <form action={formAction} className="grid gap-5">
      {entry && <input type="hidden" name="id" value={entry.id} />}
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="categoryId" value={categoryId ?? ""} />

      <Segmented
        label="Entry type"
        fill
        value={type}
        onChange={changeType}
        options={[
          { value: "expense", label: "Spent" },
          { value: "income", label: "Received" },
          { value: "transfer", label: "Moved" },
        ]}
      />

      <FormField id="amount" label="Amount" error={errors.amount}>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-lg text-muted-foreground">
            {currencySymbol(data.currency)}
          </span>
          <Input
            {...fieldAria("amount", errors.amount)}
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            autoFocus
            placeholder="0"
            defaultValue={entry ? minorToInput(entry.amountMinor, data.currency) : ""}
            className="tabular h-12 pl-9 text-xl md:text-xl"
          />
        </div>
      </FormField>

      <FormField
        id="description"
        label={isTransfer ? "Note (optional)" : "What was it for?"}
        error={errors.description}
      >
        <Input
          {...fieldAria("description", errors.description)}
          name="description"
          autoComplete="off"
          maxLength={200}
          placeholder={isTransfer ? "Credit card bill" : type === "income" ? "October salary" : "Chai and samosa"}
          defaultValue={entry?.description ?? ""}
          className="h-10"
        />
      </FormField>

      {!isTransfer && (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">
            Category <span className="font-normal text-muted-foreground">(optional)</span>
          </legend>
          <div role="radiogroup" aria-label="Category" className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto p-0.5">
            {categories.map((c) => {
              const selected = c.id === categoryId;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setCategoryId(selected ? null : c.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    selected
                      ? "border-primary bg-accent text-accent-foreground"
                      : "border-border hover:bg-muted",
                  )}
                >
                  <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                  {c.name}
                </button>
              );
            })}
          </div>
          {errors.categoryId && (
            <p role="alert" className="text-sm text-destructive">
              {errors.categoryId}
            </p>
          )}
        </fieldset>
      )}

      <div className={cn("grid gap-4", isTransfer && "sm:grid-cols-2")}>
        <FormField
          id="walletId"
          label={isTransfer ? "From" : type === "income" ? "Received in" : "Paid from"}
          error={errors.walletId}
        >
          <NativeSelect
            {...fieldAria("walletId", errors.walletId)}
            name="walletId"
            defaultValue={entry?.walletId ?? firstWallet}
            className="w-full"
          >
            {wallets.map((w) => (
              <NativeSelectOption key={w.id} value={w.id}>
                {w.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        {isTransfer && (
          <FormField id="toWalletId" label="To" error={errors.toWalletId}>
            <NativeSelect
              {...fieldAria("toWalletId", errors.toWalletId)}
              name="toWalletId"
              defaultValue={entry?.toWalletId ?? otherWallet}
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
      {isTransfer && wallets.length < 2 && (
        <p className="-mt-2 text-sm text-muted-foreground">
          Moving money needs two wallets. Add another one on the Wallets page.
        </p>
      )}

      <FormField id="occurredOn" label="Date" error={errors.occurredOn}>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            {...fieldAria("occurredOn", errors.occurredOn)}
            type="date"
            name="occurredOn"
            value={date}
            max={addDays(data.today, 366)}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 w-auto"
          />
          <Button type="button" size="sm" variant={date === data.today ? "secondary" : "ghost"} onClick={() => setDate(data.today)}>
            Today
          </Button>
          <Button type="button" size="sm" variant={date === yesterday ? "secondary" : "ghost"} onClick={() => setDate(yesterday)}>
            Yesterday
          </Button>
        </div>
      </FormField>

      {showNotes ? (
        <FormField id="notes" label="Notes" error={errors.notes}>
          <Textarea {...fieldAria("notes", errors.notes)} name="notes" maxLength={1000} rows={2} defaultValue={entry?.notes ?? ""} />
        </FormField>
      ) : (
        <button
          type="button"
          onClick={() => setShowNotes(true)}
          className="justify-self-start rounded text-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Add a note
        </button>
      )}

      {state && !state.ok && state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        {entry ? (
          <Button type="button" variant="destructive" onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" size="lg" disabled={pending} className="px-5">
          {pending ? "Saving…" : entry ? "Save changes" : "Save entry"}
        </Button>
      </div>

      {entry && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Delete this entry?"
          description="It will be removed from your history and wallet balances. This can't be undone."
          confirmLabel="Delete entry"
          pendingLabel="Deleting…"
          destructive
          onConfirm={async () => {
            const result = await removeTransaction(entry.id);
            if (result?.ok) {
              toast.success("Entry deleted");
              onDone();
              return true;
            }
            toast.error(result?.error ?? "Couldn't delete the entry. Try again.");
            return false;
          }}
        />
      )}
    </form>
  );
}
