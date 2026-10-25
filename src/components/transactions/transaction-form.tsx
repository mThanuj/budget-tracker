"use client";

import { SparklesIcon } from "lucide-react";
import Link from "next/link";
import { useActionState, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { CategoryChips } from "@/components/categories/category-chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui-extra/confirm-dialog";
import { FormField, fieldAria } from "@/components/ui-extra/form-field";
import { Segmented } from "@/components/ui-extra/segmented";
import { addDays } from "@/lib/dates";
import { currencySymbol, minorToInput } from "@/lib/money";
import { type ParseResult, parseEntryText, suggestCategoryFor } from "@/server/actions/ai";
import type { EntryFormData } from "@/server/actions/entry-form";
import type { EntryPrefill } from "@/server/ai/parse-entry";
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

const PARSE_MESSAGES: Record<Exclude<ParseResult, { ok: true }>["reason"], string> = {
  too_short: "Type a little more, like “spent 240 on chai”.",
  disabled: "AI is switched off. Turn it on in Settings, or fill in the form below.",
  limit: "You've used today's AI entries. The form below works just the same.",
  busy: "The AI is busy right now. Fill in the form below, or try again in a minute.",
  unreadable: "Couldn't make sense of that. Try rephrasing, or fill in the form below.",
  no_amount: "Couldn't find an amount. Include it, like “spent 240 on chai”.",
};

/** "Type it in words": a sentence in, a filled-in form out. Nothing is saved here. */
function TypeItBox({ onFilled }: { onFilled: (prefill: EntryPrefill) => void }) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await parseEntryText(text);
          if (result.ok) {
            onFilled(result.prefill);
            setMessage({ tone: "ok", text: "Filled in from your note. Check it, then save." });
          } else {
            setMessage({ tone: "error", text: PARSE_MESSAGES[result.reason] });
          }
        });
      }}
      className="grid gap-2 rounded-xl bg-muted/60 p-3"
    >
      <label htmlFor="type-it" className="text-sm font-medium">
        Type it in words
      </label>
      <div className="flex gap-2">
        <Input
          id="type-it"
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoComplete="off"
          autoFocus
          maxLength={300}
          placeholder="spent 240 on chai yesterday, paid cash"
          className="h-10 bg-background"
        />
        <Button type="submit" disabled={pending || text.trim().length === 0} className="h-10 shrink-0">
          <SparklesIcon aria-hidden />
          {pending ? "Reading…" : "Fill in"}
        </Button>
      </div>
      <p aria-live="polite" className={cn("text-xs", message?.tone === "error" ? "text-destructive" : "text-muted-foreground")}>
        {message?.text ?? (
          <>
            Uses AI: what you type here is sent to our AI provider to fill in the form.{" "}
            <Link href="/settings" className="underline underline-offset-2 hover:text-foreground">
              Settings
            </Link>
          </>
        )}
      </p>
    </form>
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
  const [prefill, setPrefill] = useState<EntryPrefill | null>(null);
  const [version, setVersion] = useState(0);
  return (
    <div className="grid gap-5">
      {!entry && data.ai && (
        <TypeItBox
          onFilled={(p) => {
            setPrefill(p);
            setVersion((v) => v + 1); // re-create the fields with the new values
          }}
        />
      )}
      <EntryFields key={version} data={data} entry={entry} preset={preset} prefill={prefill} onDone={onDone} />
    </div>
  );
}

function EntryFields({
  data,
  entry,
  preset,
  prefill,
  onDone,
}: {
  data: EntryFormData;
  entry?: EditableEntry;
  preset?: EntryPreset;
  prefill: EntryPrefill | null;
  onDone: () => void;
}) {
  const [type, setType] = useState<EntryType>(entry?.type ?? prefill?.type ?? preset?.type ?? "expense");
  const [categoryId, setCategoryId] = useState<string | null>(entry?.categoryId ?? prefill?.categoryId ?? null);
  // A category the app chose (from the note, past entries or AI) until the user picks one.
  const [suggestedId, setSuggestedId] = useState<string | null>(prefill?.categoryId ?? null);
  const userPicked = useRef(Boolean(entry));
  const descriptionRef = useRef(entry?.description ?? prefill?.description ?? "");
  const [date, setDate] = useState(entry?.occurredOn ?? prefill?.occurredOn ?? data.today);
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
    if ((next === "income") !== (type === "income") || next === "transfer") {
      setCategoryId(null);
      setSuggestedId(null);
    }
    setType(next);
  }

  function pickCategory(id: string | null) {
    userPicked.current = true;
    setSuggestedId(null);
    setCategoryId(id);
  }

  // When the description is done, pre-select a likely category (unless the user chose one).
  async function suggestFor(description: string) {
    const text = description.trim();
    if (userPicked.current || type === "transfer" || text.length < 2) return;
    const result = await suggestCategoryFor(text, type);
    if (result && !userPicked.current && descriptionRef.current.trim() === text) {
      setCategoryId(result.categoryId);
      setSuggestedId(result.categoryId);
    }
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
            autoFocus={!data.ai || Boolean(entry)}
            placeholder="0"
            defaultValue={
              entry
                ? minorToInput(entry.amountMinor, data.currency)
                : prefill
                  ? minorToInput(prefill.amountMinor, data.currency)
                  : ""
            }
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
          defaultValue={entry?.description ?? prefill?.description ?? ""}
          onChange={(e) => (descriptionRef.current = e.target.value)}
          onBlur={(e) => void suggestFor(e.target.value)}
          className="h-10"
        />
      </FormField>

      {!isTransfer && (
        <CategoryChips
          categories={categories}
          value={categoryId}
          onChange={pickCategory}
          suggestedId={suggestedId}
          error={errors.categoryId}
        />
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
            defaultValue={entry?.walletId ?? prefill?.walletId ?? firstWallet}
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
              defaultValue={entry?.toWalletId ?? prefill?.toWalletId ?? otherWallet}
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
