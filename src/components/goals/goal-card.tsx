"use client";

import { MoreHorizontalIcon, PartyPopperIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { CategoryIcon } from "@/components/categories/category-icon";
import { Meter } from "@/components/charts/meter";
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
import { formatMonth } from "@/lib/date-format";
import { goalProgress } from "@/lib/goals";
import { formatMoney } from "@/lib/money";
import { goalAction } from "@/server/actions/goals";
import { ContributionDialog, type EditableGoal, GoalDialog } from "./goal-forms";
import { callAction, NOT_SENT } from "@/lib/call-action";

export type GoalCardData = EditableGoal & { savedMinor: number; archived: boolean };

export function NewGoalButton({ currency, today }: { currency: string; today: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon aria-hidden />
        New goal
      </Button>
      <GoalDialog open={open} onOpenChange={setOpen} currency={currency} today={today} />
    </>
  );
}

async function run(op: Parameters<typeof goalAction>[0], id: string, success: string) {
  const result = await callAction(() => goalAction(op, id));
  if (result === NOT_SENT) return false;
  if (result?.ok) {
    toast.success(success);
    return true;
  }
  toast.error(result?.error ?? "Something went wrong. Try again.");
  return false;
}

export function GoalCard({ goal, currency, today }: { goal: GoalCardData; currency: string; today: string }) {
  const [editing, setEditing] = useState(false);
  const [contributing, setContributing] = useState<"add" | "withdraw" | null>(null);
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);
  const p = goalProgress({ targetMinor: goal.targetMinor, savedMinor: goal.savedMinor, targetDate: goal.targetDate, today });

  let plan: string;
  if (p.reached) plan = "Goal reached. You can archive it or keep adding.";
  else if (p.overdue) plan = "The target date has passed. Pick a new date to see a monthly plan.";
  else if (p.perMonthMinor !== null && goal.targetDate)
    plan = `Save ${formatMoney(p.perMonthMinor, currency)} a month to make it by ${formatMonth(goal.targetDate.slice(0, 7))}.`;
  else plan = `${formatMoney(p.remainingMinor, currency)} to go. Add a date to get a monthly plan.`;

  return (
    <article className={cn("flex flex-col gap-4 rounded-2xl bg-card p-5 ring-1 ring-foreground/10", goal.archived && "opacity-70")}>
      <div className="flex items-start gap-3">
        <CategoryIcon icon={goal.icon} color={goal.color} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 font-medium">
            <span className="truncate">{goal.name}</span>
            {p.reached && (
              <Badge variant="secondary">
                <PartyPopperIcon aria-hidden />
                Reached
              </Badge>
            )}
            {goal.archived && <Badge variant="outline">Archived</Badge>}
          </h3>
          <p className="text-sm text-muted-foreground">
            {goal.targetDate ? `By ${formatMonth(goal.targetDate.slice(0, 7))}` : "No target date"}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Actions for ${goal.name}`}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <MoreHorizontalIcon className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {goal.archived ? (
              <DropdownMenuItem onClick={() => run("restore", goal.id, "Goal restored")}>Restore</DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => setEditing(true)}>Edit</DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {!goal.archived && <DropdownMenuItem onClick={() => setConfirm("archive")}>Archive</DropdownMenuItem>}
            <DropdownMenuItem variant="destructive" onClick={() => setConfirm("delete")}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div>
        <p className="text-2xl font-semibold">
          {formatMoney(goal.savedMinor, currency)}
          <span className="ml-1.5 text-sm font-normal text-muted-foreground">of {formatMoney(goal.targetMinor, currency)}</span>
        </p>
        <Meter
          className="mt-3"
          ratio={p.ratio}
          label={`${goal.name} progress`}
          valueText={`${formatMoney(goal.savedMinor, currency)} of ${formatMoney(goal.targetMinor, currency)} saved`}
        />
        <p className="mt-2 text-sm text-muted-foreground">{plan}</p>
      </div>

      {!goal.archived && (
        <div className="mt-auto flex flex-wrap gap-2">
          <Button onClick={() => setContributing("add")}>Add money</Button>
          {goal.savedMinor > 0 && (
            <Button variant="outline" onClick={() => setContributing("withdraw")}>
              Take out
            </Button>
          )}
        </div>
      )}

      <GoalDialog open={editing} onOpenChange={setEditing} goal={goal} currency={currency} today={today} />
      <ContributionDialog
        open={contributing !== null}
        onOpenChange={(o) => !o && setContributing(null)}
        goal={goal}
        savedMinor={goal.savedMinor}
        direction={contributing ?? "add"}
        currency={currency}
        today={today}
      />
      <ConfirmDialog
        open={confirm === "archive"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Archive “${goal.name}”?`}
        description="It moves out of your list and stops counting as money set aside. You can restore it any time."
        confirmLabel="Archive goal"
        pendingLabel="Archiving…"
        onConfirm={() => run("archive", goal.id, "Goal archived")}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Delete “${goal.name}”?`}
        description="The goal and its history are removed. Your wallets aren't affected. This can't be undone."
        confirmLabel="Delete goal"
        pendingLabel="Deleting…"
        destructive
        onConfirm={() => run("delete", goal.id, "Goal deleted")}
      />
    </article>
  );
}
