"use client";

import { ArrowLeftRightIcon, MoreHorizontalIcon, PlusIcon, SparklesIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { CategoryIcon } from "@/components/categories/category-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui-extra/confirm-dialog";
import { Segmented } from "@/components/ui-extra/segmented";
import { relativeDay } from "@/lib/date-format";
import { formatMoney } from "@/lib/money";
import { describeRepeat, monthlyEquivalent } from "@/lib/recurring";
import { ruleAction, subscriptionSuggestionAction } from "@/server/actions/recurring";
import { type EditableRule, RuleDialog, type RuleFormData, type RulePreset } from "./rule-form";
import { EmptyState } from "@/components/app/empty-state";

export type RuleItem = EditableRule & {
  active: boolean;
  nextDueOn: string | null;
  walletName: string;
  toWalletName: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  latestAmountMinor: number | null;
  previousAmountMinor: number | null;
};

export type Suggestion = {
  merchantKey: string;
  name: string;
  amountMinor: number;
  frequency: "weekly" | "monthly" | "yearly";
  lastOn: string;
  occurrences: number;
};

const FREQUENCY_WORD = { weekly: "weekly", monthly: "monthly", yearly: "yearly" } as const;

function signed(r: Pick<RuleItem, "type" | "amountMinor">, currency: string) {
  const amount = formatMoney(r.amountMinor, currency);
  return r.type === "income" ? `+${amount}` : r.type === "expense" ? `−${amount}` : amount;
}

function RuleRow({ r, data }: { r: RuleItem; data: RuleFormData }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const run = async (op: "pause" | "resume" | "delete", done: string) => {
    const result = await ruleAction(op, r.id);
    if (result?.ok) toast.success(done);
    else toast.error(result?.error ?? "Something went wrong. Try again.");
    return Boolean(result?.ok);
  };
  const priceChange =
    r.isSubscription && r.latestAmountMinor && r.previousAmountMinor && r.latestAmountMinor !== r.previousAmountMinor
      ? { up: r.latestAmountMinor > r.previousAmountMinor, from: r.previousAmountMinor }
      : null;

  return (
    <li className={cn("flex items-center gap-3 px-4 py-3.5 sm:px-5", !r.active && "opacity-70")}>
      {r.type === "transfer" ? (
        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
          <ArrowLeftRightIcon className="size-4" />
        </span>
      ) : (
        <CategoryIcon icon={r.categoryIcon ?? (r.isSubscription ? "repeat" : "receipt")} color={r.categoryColor} />
      )}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-medium">{r.description}</span>
          {!r.active && <Badge variant="outline">Paused</Badge>}
          {r.active && r.mode === "confirm" && <Badge variant="secondary">Asks first</Badge>}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {describeRepeat(r.frequency, r.interval, r.anchorDate)} ·{" "}
          {r.type === "transfer" ? `${r.walletName} → ${r.toWalletName}` : r.walletName}
        </p>
        <p className="text-xs text-muted-foreground">
          {r.active && r.nextDueOn ? `Next: ${relativeDay(r.nextDueOn, data.today)}` : r.nextDueOn ? "Paused" : "Finished"}
          {priceChange && (
            <span className={cn("ml-2 inline-flex items-center gap-1", priceChange.up ? "text-warning" : "text-primary")}>
              {priceChange.up ? <TrendingUpIcon className="size-3.5" aria-hidden /> : <TrendingDownIcon className="size-3.5" aria-hidden />}
              {priceChange.up ? "Up" : "Down"} from {formatMoney(priceChange.from, data.currency)}
            </span>
          )}
        </p>
      </div>
      <span className={cn("tabular shrink-0 text-right text-sm", r.type === "income" && "text-primary", r.type === "transfer" && "text-muted-foreground")}>
        {signed(r, data.currency)}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Actions for ${r.description}`}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <MoreHorizontalIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => setEditing(true)}>Edit</DropdownMenuItem>
          {r.active ? (
            <DropdownMenuItem onClick={() => run("pause", `${r.description} paused`)}>Pause</DropdownMenuItem>
          ) : (
            r.nextDueOn !== null && <DropdownMenuItem onClick={() => run("resume", `${r.description} resumed`)}>Resume</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RuleDialog open={editing} onOpenChange={setEditing} data={data} rule={r} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete “${r.description}”?`}
        description="It stops repeating. Entries already recorded stay in your history."
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        destructive
        onConfirm={() => run("delete", `${r.description} deleted`)}
      />
    </li>
  );
}

function SuggestionRow({ s, currency, today }: { s: Suggestion; currency: string; today: string }) {
  const [busy, setBusy] = useState(false);
  const act = async (op: "track" | "dismiss") => {
    setBusy(true);
    const result = await subscriptionSuggestionAction(op, s.merchantKey);
    setBusy(false);
    if (result?.ok) toast.success(op === "track" ? `Tracking ${s.name}` : "Got it, we won't suggest that again");
    else toast.error(result?.error ?? "Something went wrong. Try again.");
  };
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
      <SparklesIcon className="size-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate">
          <span className="font-medium">{s.name}</span>{" "}
          <span className="text-muted-foreground">looks like a {FREQUENCY_WORD[s.frequency]} subscription</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {formatMoney(s.amountMinor, currency)} · charged {s.occurrences} times · last charged {relativeDay(s.lastOn, today)}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => act("dismiss")}>
          Not a subscription
        </Button>
        <Button size="sm" disabled={busy} onClick={() => act("track")}>
          Track it
        </Button>
      </div>
    </li>
  );
}

export function RecurringManager({
  rules,
  suggestions,
  data,
  initialView,
}: {
  rules: RuleItem[];
  suggestions: Suggestion[];
  data: RuleFormData;
  initialView: "all" | "subscriptions";
}) {
  const [view, setView] = useState(initialView);
  const [creating, setCreating] = useState<RulePreset | null>(null);
  const subscriptions = rules.filter((r) => r.isSubscription);
  const shown = view === "subscriptions" ? subscriptions : rules;
  const active = subscriptions.filter((r) => r.active && r.nextDueOn);
  const monthly = active.reduce((sum, r) => sum + monthlyEquivalent(r.amountMinor, r.frequency, r.interval), 0);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Show"
          value={view}
          onChange={setView}
          options={[
            { value: "all", label: "Everything" },
            { value: "subscriptions", label: `Subscriptions${subscriptions.length ? ` (${subscriptions.length})` : ""}` },
          ]}
        />
        <Button onClick={() => setCreating(view === "subscriptions" ? { type: "expense", isSubscription: true } : {})}>
          <PlusIcon aria-hidden />
          {view === "subscriptions" ? "Add subscription" : "New recurring item"}
        </Button>
      </div>

      {view === "subscriptions" && (
        <section aria-labelledby="subs-total" className="flex flex-wrap items-end justify-between gap-4 rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
          <div>
            <p id="subs-total" className="text-sm text-muted-foreground">
              Subscriptions cost you
            </p>
            <p className="mt-1 text-4xl font-semibold tracking-tight">
              {formatMoney(monthly, data.currency)}
              <span className="ml-2 text-base font-normal text-muted-foreground">a month</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              About {formatMoney(monthly * 12, data.currency)} a year across {active.length}{" "}
              {active.length === 1 ? "subscription" : "subscriptions"}.
            </p>
          </div>
        </section>
      )}

      {(view === "subscriptions" || subscriptions.length === 0) && suggestions.length > 0 && (
        <section aria-labelledby="suggestions-title" className="overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10">
          <h2 id="suggestions-title" className="border-b border-border px-4 py-3 font-medium sm:px-5">
            Found in your entries
          </h2>
          <ul className="divide-y divide-dashed divide-border">
            {suggestions.map((s) => (
              <SuggestionRow key={s.merchantKey} s={s} currency={data.currency} today={data.today} />
            ))}
          </ul>
        </section>
      )}

      {shown.length === 0 ? (
        <EmptyState title={view === "subscriptions" ? "No subscriptions tracked yet" : "Nothing repeats yet"}>
          {view === "subscriptions"
            ? "Add Netflix, Spotify, your gym or any app you pay for, and see what they cost you together."
            : "Add rent, salary, EMIs and bills once, and they'll be recorded on their dates."}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-dashed divide-border overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10">
          {shown.map((r) => (
            <RuleRow key={r.id} r={r} data={data} />
          ))}
        </ul>
      )}

      <p className="text-sm text-muted-foreground">
        Recorded entries appear in{" "}
        <Link href="/transactions" className="link-inline">
          Entries
        </Link>{" "}
        like anything else, so you can edit or delete them there.
      </p>

      <RuleDialog open={creating !== null} onOpenChange={(o) => !o && setCreating(null)} data={data} preset={creating ?? undefined} />
    </div>
  );
}
