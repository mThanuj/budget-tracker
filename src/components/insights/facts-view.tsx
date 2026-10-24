import { CircleAlertIcon, CircleCheckIcon, CopyIcon, OctagonAlertIcon, TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { InsightFacts } from "@/lib/insights";

function Stat({ label, value, note }: { label: string; value: string; note?: ReactNode }) {
  return (
    // A row on phones (label left, amount right), a tile from sm up.
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 rounded-xl bg-muted/50 px-4 py-3 sm:block sm:p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tracking-tight sm:mt-1 sm:text-xl">{value}</dd>
      {note && <dd className="col-span-2 mt-0.5 text-sm text-muted-foreground">{note}</dd>}
    </div>
  );
}

function Note({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{children}</span>
    </li>
  );
}

/** The numbers behind a report. Shown to everyone, and on their own when there's no AI. */
export function FactsView({ facts }: { facts: InsightFacts }) {
  const limit = facts.overallLimit;
  const notes: ReactNode[] = [];
  for (const b of facts.budgetsOver) {
    notes.push(
      <Note key={`over-${b.category}`} icon={<OctagonAlertIcon className="size-4 text-destructive" aria-label="Over budget" />}>
        {b.category}: {b.spent} of {b.limit}, {b.over} over
      </Note>,
    );
  }
  for (const b of facts.budgetsNearLimit) {
    notes.push(
      <Note key={`near-${b.category}`} icon={<TriangleAlertIcon className="size-4 text-warning" aria-label="Almost used up" />}>
        {b.category}: {b.used} of {b.limit} used
      </Note>,
    );
  }
  for (const d of facts.possibleDuplicates) {
    notes.push(
      <Note key={`dup-${d.what}-${d.dates[0]}`} icon={<CopyIcon className="size-4 text-warning" aria-label="Possible double charge" />}>
        {d.what}, {d.amount} on {d.dates.join(" and ")}. Charged twice?
      </Note>,
    );
  }
  for (const p of facts.priceChanges) {
    notes.push(
      <Note key={`price-${p.name}`} icon={<CircleAlertIcon className="size-4 text-muted-foreground" aria-label="Price change" />}>
        {p.name} changed from {p.from} to {p.to}
      </Note>,
    );
  }
  if (facts.entriesWithoutCategory > 0) {
    notes.push(
      <Note key="uncat" icon={<CircleAlertIcon className="size-4 text-muted-foreground" aria-label="Tip" />}>
        {facts.entriesWithoutCategory} {facts.entriesWithoutCategory === 1 ? "expense has" : "expenses have"} no category
      </Note>,
    );
  }

  return (
    <div className="grid gap-5">
      <dl className="grid gap-2 sm:grid-cols-3 sm:gap-3">
        <Stat label="Came in" value={facts.income} note={facts.noIncomeRecorded ? "No income recorded" : undefined} />
        <Stat
          label="Spent"
          value={facts.spending}
          note={facts.comparedWith && `${facts.comparedWith.change} than ${facts.comparedWith.period} (${facts.comparedWith.spending})`}
        />
        {facts.kept ? (
          <Stat label="Kept" value={facts.kept.amount} note={`${facts.kept.shareOfIncome} of what came in`} />
        ) : facts.spentMoreThanIncomeBy ? (
          <Stat label="Spent more than came in" value={facts.spentMoreThanIncomeBy} />
        ) : limit ? (
          <Stat label="Monthly limit" value={limit.left ?? limit.over ?? ""} note={limit.left ? `left of ${limit.limit}` : `over ${limit.limit}`} />
        ) : null}
      </dl>

      {limit && (
        <p className="flex items-start gap-2 text-sm">
          {limit.over ? (
            <OctagonAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          ) : limit.projectedOverLimit ? (
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          ) : (
            <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          )}
          <span>
            Monthly limit: {limit.spent} of {limit.limit} ({limit.used}){limit.over ? `, ${limit.over} over` : ""}.
            {limit.projectedMonthEnd &&
              ` At this pace, ${limit.projectedMonthEnd} by the end of the month${limit.projectedOverLimit ? ", more than the limit" : ""}.`}
          </span>
        </p>
      )}

      {facts.categories.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="mb-2 text-left font-medium">Where it went</caption>
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-normal">Category</th>
                <th scope="col" className="py-2 pr-3 text-right font-normal">Spent</th>
                <th scope="col" className="py-2 pr-3 text-right font-normal">Share</th>
                <th scope="col" className="hidden py-2 text-right font-normal sm:table-cell">
                  {facts.comparedWith ? `vs ${facts.comparedWith.period}` : "Before"}
                </th>
              </tr>
            </thead>
            <tbody>
              {facts.categories.map((c) => (
                <tr key={c.name} className="border-b border-border/60 last:border-0">
                  <th scope="row" className="py-2 pr-3 text-left font-normal">{c.name}</th>
                  <td className="tabular py-2 pr-3 text-right">{c.spent}</td>
                  <td className="tabular py-2 pr-3 text-right text-muted-foreground">{c.shareOfSpending}</td>
                  <td className="hidden py-2 text-right text-muted-foreground sm:table-cell">{c.change}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {facts.biggestExpenses.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium">Biggest expenses</h3>
            <ul className="grid gap-1.5 text-sm">
              {facts.biggestExpenses.map((b, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">
                    {b.what} <span className="text-muted-foreground">· {b.date}</span>
                  </span>
                  <span className="tabular shrink-0">{b.amount}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {facts.goals.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium">Goals</h3>
            <ul className="grid gap-1.5 text-sm">
              {facts.goals.map((g) => (
                <li key={g.name}>
                  {g.name}: {g.saved} of {g.target}
                  <span className="text-muted-foreground"> · {g.addedInPeriod} added</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {notes.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium">Worth a look</h3>
          <ul className="grid gap-2">{notes}</ul>
        </div>
      )}
      {facts.trackedSubscriptions && (
        <p className="text-sm text-muted-foreground">
          {facts.trackedSubscriptions.spent} went to {facts.trackedSubscriptions.count} tracked{" "}
          {facts.trackedSubscriptions.count === 1 ? "subscription" : "subscriptions"}.
        </p>
      )}
    </div>
  );
}
