"use client";

import { MoreHorizontalIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { CategoryIcon } from "@/components/categories/category-icon";
import { BudgetStatus, Meter } from "@/components/charts/meter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui-extra/confirm-dialog";
import type { BudgetLevel } from "@/lib/budgets";
import { formatMoney } from "@/lib/money";
import { removeBudget } from "@/server/actions/budgets";
import { BudgetDialog, type BudgetTarget } from "./budget-form";
import { EmptyState } from "@/components/app/empty-state";
import { callAction, NOT_SENT } from "@/lib/call-action";

export type BudgetRowData = {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  categoryArchived: boolean;
  amountMinor: number;
  rollover: boolean;
  carryInMinor: number;
  spentMinor: number;
  availableMinor: number;
  remainingMinor: number;
  ratio: number;
  level: BudgetLevel;
};

type CategoryOption = { id: string; name: string; icon: string; color: string };

type Shared = {
  currency: string;
  suggestions: Record<string, number>;
  unbudgeted: CategoryOption[];
  month: string;
};

function remainingText(b: BudgetRowData, currency: string) {
  return b.remainingMinor >= 0
    ? `${formatMoney(b.remainingMinor, currency)} left`
    : `${formatMoney(-b.remainingMinor, currency)} over`;
}

function carryText(b: BudgetRowData, currency: string) {
  if (!b.rollover || b.carryInMinor === 0) return null;
  return b.carryInMinor > 0
    ? `includes ${formatMoney(b.carryInMinor, currency)} carried over`
    : `${formatMoney(-b.carryInMinor, currency)} overspent earlier taken off`;
}

function BudgetMenu({ b, onEdit, label }: { b: BudgetRowData; onEdit: () => void; label: string }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Actions for ${label}`}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <MoreHorizontalIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
          {b.categoryId && (
            <DropdownMenuItem render={<Link href={`/transactions?category=${b.categoryId}`} />}>View entries</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setConfirm(true)}>
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Remove the ${label}?`}
        description="Your entries stay as they are. You can set a new budget any time."
        confirmLabel="Remove budget"
        pendingLabel="Removing…"
        destructive
        onConfirm={async () => {
          const result = await callAction(() => removeBudget(b.id));
          if (result === NOT_SENT) return false;
          if (result?.ok) {
            toast.success("Budget removed");
            return true;
          }
          toast.error(result?.error ?? "Couldn't remove the budget. Try again.");
          return false;
        }}
      />
    </>
  );
}

export function OverallBudgetCard({
  overall,
  totalSpentMinor,
  daysLeft,
  ...shared
}: Shared & { overall: BudgetRowData | null; totalSpentMinor: number; daysLeft: number | null }) {
  const [editing, setEditing] = useState(false);
  const target: BudgetTarget = overall
    ? { mode: "overall", budget: { id: overall.id, amountMinor: overall.amountMinor } }
    : { mode: "overall" };

  return (
    <section aria-labelledby="overall-title" className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="flex items-start justify-between gap-3">
        <h2 id="overall-title" className="text-sm text-muted-foreground">
          Monthly spending limit
        </h2>
        {overall && <BudgetMenu b={overall} onEdit={() => setEditing(true)} label="monthly limit" />}
      </div>
      {overall ? (
        <>
          <p className="mt-1 text-4xl font-semibold tracking-tight">
            {formatMoney(Math.abs(overall.remainingMinor), shared.currency)}
            <span className="ml-2 text-base font-normal text-muted-foreground">
              {overall.remainingMinor >= 0 ? (daysLeft === null ? "unspent" : "left") : "over"}
            </span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatMoney(overall.spentMinor, shared.currency)} spent of {formatMoney(overall.amountMinor, shared.currency)}
            {daysLeft !== null && overall.remainingMinor > 0 && (
              <>
                {" "}· {daysLeft} {daysLeft === 1 ? "day" : "days"} left, about{" "}
                {formatMoney(Math.floor(overall.remainingMinor / daysLeft), shared.currency)} a day
              </>
            )}
          </p>
          <Meter
            className="mt-4"
            ratio={overall.ratio}
            level={overall.level}
            label="Monthly spending limit"
            valueText={`${formatMoney(overall.spentMinor, shared.currency)} of ${formatMoney(overall.availableMinor, shared.currency)} spent`}
          />
          {overall.level !== "ok" && <BudgetStatus level={overall.level} className="mt-2" />}
        </>
      ) : (
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <p className="max-w-md text-muted-foreground">
            Set one number for everything you spend in a month. You&apos;ll always know how much is left.
            {totalSpentMinor > 0 && ` So far this month: ${formatMoney(totalSpentMinor, shared.currency)}.`}
          </p>
          <Button onClick={() => setEditing(true)}>Set a monthly limit</Button>
        </div>
      )}
      <BudgetDialog
        open={editing}
        onOpenChange={setEditing}
        target={target}
        categories={shared.unbudgeted}
        suggestions={shared.suggestions}
        currency={shared.currency}
      />
    </section>
  );
}

function CategoryBudgetRow({ b, ...shared }: Shared & { b: BudgetRowData }) {
  const [editing, setEditing] = useState(false);
  const name = b.categoryName ?? "Category";
  const carry = carryText(b, shared.currency);
  return (
    <li className="grid gap-2.5 px-4 py-4 sm:px-5">
      <div className="flex items-center gap-3">
        <CategoryIcon icon={b.categoryIcon} color={b.categoryColor} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            {name}
            {b.categoryArchived && <span className="ml-2 text-xs font-normal text-muted-foreground">(archived)</span>}
          </p>
        </div>
        <p className="tabular shrink-0 text-right text-sm">
          {formatMoney(b.spentMinor, shared.currency)}
          <span className="text-muted-foreground"> of {formatMoney(b.availableMinor, shared.currency)}</span>
        </p>
        <BudgetMenu b={b} onEdit={() => setEditing(true)} label={`${name} budget`} />
      </div>
      <Meter
        ratio={b.ratio}
        level={b.level}
        label={`${name} budget`}
        valueText={`${formatMoney(b.spentMinor, shared.currency)} of ${formatMoney(b.availableMinor, shared.currency)} spent`}
      />
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <BudgetStatus level={b.level} />
        <span aria-hidden>·</span>
        <span>{remainingText(b, shared.currency)}</span>
        {carry && (
          <>
            <span aria-hidden>·</span>
            <span>{carry}</span>
          </>
        )}
      </p>
      <BudgetDialog
        open={editing}
        onOpenChange={setEditing}
        target={{
          mode: "category",
          budget: { id: b.id, amountMinor: b.amountMinor, rollover: b.rollover, categoryId: b.categoryId!, categoryName: name },
        }}
        categories={shared.unbudgeted}
        suggestions={shared.suggestions}
        currency={shared.currency}
      />
    </li>
  );
}

export function CategoryBudgets({
  budgets,
  unbudgetedMinor,
  ...shared
}: Shared & { budgets: BudgetRowData[]; unbudgetedMinor: number }) {
  const [adding, setAdding] = useState(false);
  return (
    <section aria-labelledby="category-budgets-title" className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="category-budgets-title" className="font-heading text-xl">
          Category budgets
        </h2>
        <Button variant="outline" onClick={() => setAdding(true)} disabled={shared.unbudgeted.length === 0}>
          <PlusIcon aria-hidden />
          Add budget
        </Button>
      </div>
      {budgets.length === 0 ? (
        <EmptyState headingLevel={3} title="No category budgets yet">
          Pick the categories where money tends to slip away, like Dining Out or Shopping, and give each a monthly limit.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-dashed divide-border overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10">
          {budgets.map((b) => (
            <CategoryBudgetRow key={b.id} b={b} {...shared} />
          ))}
        </ul>
      )}
      {unbudgetedMinor > 0 && budgets.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {formatMoney(unbudgetedMinor, shared.currency)} spent this month in categories without a budget.
        </p>
      )}
      <BudgetDialog
        open={adding}
        onOpenChange={setAdding}
        target={{ mode: "category" }}
        categories={shared.unbudgeted}
        suggestions={shared.suggestions}
        currency={shared.currency}
      />
    </section>
  );
}
