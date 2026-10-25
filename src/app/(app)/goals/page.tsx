import { Suspense } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { type GoalCardData, GoalCard, NewGoalButton } from "@/components/goals/goal-card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/money";
import { db } from "@/server/db";
import { listGoals } from "@/server/services/goals";
import { requireUser } from "@/server/session";
import { userCurrency, userToday } from "@/lib/user-prefs";

export const metadata = { title: "Goals" };

export default function GoalsPage() {
  return (
    <>
      <PageHeader
        title="Goals"
        description="Save up for the things that matter to you."
        actions={
          <Suspense fallback={<Skeleton className="h-8 w-28 rounded-lg" />}>
            <GoalActions />
          </Suspense>
        }
      />
      <Suspense fallback={<GoalsSkeleton />}>
        <GoalsContent />
      </Suspense>
    </>
  );
}

async function GoalActions() {
  const user = await requireUser();
  return <NewGoalButton currency={userCurrency(user)} today={userToday(user)} />;
}

async function GoalsContent() {
  const user = await requireUser();
  const currency = userCurrency(user);
  const today = userToday(user);
  const goals = await listGoals(db, user.id, { includeArchived: true });
  const toCard = (g: (typeof goals)[number]): GoalCardData => ({
    id: g.id,
    name: g.name,
    targetMinor: g.targetMinor,
    targetDate: g.targetDate,
    icon: g.icon,
    color: g.color,
    savedMinor: g.savedMinor,
    archived: g.archivedAt !== null,
  });
  const active = goals.filter((g) => !g.archivedAt);
  const archived = goals.filter((g) => g.archivedAt);
  const setAside = active.reduce((sum, g) => sum + Math.max(g.savedMinor, 0), 0);

  return (
    <div className="grid gap-8">
      <div className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
        <p className="text-sm text-muted-foreground">Set aside for goals</p>
        <p className="mt-1 text-4xl font-semibold tracking-tight">{formatMoney(setAside, currency)}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {active.length === 0
            ? "Nothing yet."
            : `Across ${active.length} ${active.length === 1 ? "goal" : "goals"}. This money stays in your wallets.`}
        </p>
      </div>

      {active.length === 0 ? (
        <EmptyState title="What are you saving for?">
          A new phone, a trip, an emergency fund. Add a goal and a date, and you&apos;ll see how much to put aside each
          month.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {active.map((g) => (
            <GoalCard key={g.id} goal={toCard(g)} currency={currency} today={today} />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground select-none hover:text-foreground">
            Archived goals ({archived.length})
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {archived.map((g) => (
              <GoalCard key={g.id} goal={toCard(g)} currency={currency} today={today} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function GoalsSkeleton() {
  return (
    <div className="grid gap-8">
      <Skeleton className="h-28 w-full rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    </div>
  );
}
