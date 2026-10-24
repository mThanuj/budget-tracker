import { tz } from "@date-fns/tz";
import { format } from "date-fns";
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { cn } from "cn";
import { CategoryIcon } from "@/components/categories/category-icon";
import { CategoryBars } from "@/components/charts/category-bars";
import { IncomeSpendingChart } from "@/components/charts/income-spending-chart";
import { BudgetStatus, Meter } from "@/components/charts/meter";
import { AlertList } from "@/components/dashboard/alert-list";
import { WaitingList } from "@/components/recurring/waiting-list";
import { AddEntryButton } from "@/components/transactions/add-entry-button";
import { TransactionRowButton } from "@/components/transactions/transaction-row";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { daysLeftInMonth } from "@/lib/budgets";
import { capitalize, relativeDay } from "@/lib/date-format";
import { addDays, addMonths, monthOf, monthRange, todayInTz } from "@/lib/dates";
import { goalProgress } from "@/lib/goals";
import { formatMoney } from "@/lib/money";
import { db } from "@/server/db";
import { type Alert, buildAlerts, buildRecurringAlerts, withoutDismissed } from "@/server/services/alerts";
import { getBudgetOverview } from "@/server/services/budgets";
import { listGoals } from "@/server/services/goals";
import { listAwaitingConfirmation, listRules, listUpcoming } from "@/server/services/recurring";
import { monthlyTotals, spendingByCategory } from "@/server/services/reports";
import { listTransactions, summarizeTransactions } from "@/server/services/transactions";
import { listWallets } from "@/server/services/wallets";
import { syncRecurring } from "@/server/recurring-sync";
import { requireUser } from "@/server/session";

export const metadata = { title: "Home" };

const ALERT_ORDER: Record<Alert["tone"], number> = { over: 0, warning: 1, info: 2, success: 3 };

function greeting(timeZone: string) {
  const hour = Number(format(new Date(), "H", { in: tz(timeZone) }));
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}

function Card({
  title,
  href,
  linkLabel,
  children,
  className,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("grid content-start gap-4 rounded-2xl bg-card p-5 ring-1 ring-foreground/10", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-lg">{title}</h2>
        {href && (
          <Link href={href} className="inline-flex items-center gap-0.5 text-sm text-primary underline-offset-4 hover:underline">
            {linkLabel}
            <ChevronRightIcon className="size-4" aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function StatTile({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

async function DashboardContent() {
  const user = await requireUser();
  if (!user.onboardedAt) redirect("/welcome");
  await syncRecurring(user);
  const currency = user.currency ?? "INR";
  const timeZone = user.timezone ?? "Asia/Kolkata";
  const today = todayInTz(timeZone);
  const month = monthOf(today);
  const { start, end } = monthRange(month);
  const prevMonth = addMonths(month, -1);
  // Compare with the same stretch of last month, not all of it.
  const prevSameDay = [addDays(`${prevMonth}-01`, Number(today.slice(8, 10))), monthRange(prevMonth).end].sort()[0];

  const [overview, goals, wallets, byCategory, totals, recent, thisMonth, lastMonthSoFar, rules, upcoming, waiting] = await Promise.all([
    getBudgetOverview(db, user.id, month),
    listGoals(db, user.id),
    listWallets(db, user.id),
    spendingByCategory(db, user.id, start, end),
    monthlyTotals(db, user.id, addMonths(month, -5), month),
    listTransactions(db, user.id, {}, 5),
    summarizeTransactions(db, user.id, { from: start, to: end }),
    summarizeTransactions(db, user.id, { from: `${prevMonth}-01`, to: prevSameDay }),
    listRules(db, user.id),
    listUpcoming(db, user.id, today, 14),
    listAwaitingConfirmation(db, user.id, today),
  ]);
  const alerts = (
    await withoutDismissed(db, user.id, [
      ...buildAlerts({ overview, goals, month, today, currency }),
      ...buildRecurringAlerts({ upcoming, rules, today, currency }),
    ])
  ).sort((a, b) => ALERT_ORDER[a.tone] - ALERT_ORDER[b.tone]);

  const firstName = user.name.split(" ")[0];
  const totalBalance = wallets.reduce((s, w) => s + w.balanceMinor, 0);
  const setAside = goals.reduce((s, g) => s + Math.max(g.savedMinor, 0), 0);
  const overall = overview.overall;
  const daysLeft = daysLeftInMonth(month, today);
  const spendDelta = thisMonth.expenseMinor - lastMonthSoFar.expenseMinor;

  const steps = [
    { done: wallets.length > 1, label: "Add your bank accounts and cards", href: "/wallets" },
    { done: recent.length > 0, label: "Record what you spend", href: "/transactions" },
    { done: overall !== null, label: "Set a monthly spending limit", href: "/budgets" },
    { done: goals.length > 0, label: "Start a savings goal", href: "/goals" },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="grid gap-6">
      <h1 className="font-heading text-3xl tracking-tight">
        {greeting(timeZone)}, {firstName}.
      </h1>

      {doneCount < steps.length && (
        <Card title="Get started">
          <p className="-mt-2 text-sm text-muted-foreground">
            {doneCount} of {steps.length} done. Each step makes this page more useful.
          </p>
          <ol className="grid gap-2 sm:grid-cols-2">
            {steps.map((s, i) => (
              <li key={s.href}>
                <Link
                  href={s.href}
                  className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-sm outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-full text-xs font-medium",
                      s.done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {s.done ? <CheckIcon className="size-3.5" aria-label="Done" /> : i + 1}
                  </span>
                  <span className={cn(s.done && "text-muted-foreground line-through")}>{s.label}</span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {/* The one number this page leads with. */}
      <section aria-labelledby="hero-label" className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10 sm:p-6">
        {overall ? (
          <>
            <p id="hero-label" className="text-sm text-muted-foreground">
              {overall.remainingMinor >= 0 ? "Left to spend this month" : "Over your monthly limit"}
            </p>
            <p className={cn("mt-1 text-5xl font-semibold tracking-tight", overall.remainingMinor < 0 && "text-destructive")}>
              {formatMoney(Math.abs(overall.remainingMinor), currency)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {formatMoney(overall.spentMinor, currency)} spent of {formatMoney(overall.amountMinor, currency)}
              {daysLeft !== null && overall.remainingMinor > 0 && (
                <>
                  {" "}· {daysLeft} {daysLeft === 1 ? "day" : "days"} left, about{" "}
                  {formatMoney(Math.floor(overall.remainingMinor / daysLeft), currency)} a day
                </>
              )}
            </p>
            <Meter
              className="mt-4"
              ratio={overall.ratio}
              level={overall.level}
              label="Monthly spending limit"
              valueText={`${formatMoney(overall.spentMinor, currency)} of ${formatMoney(overall.amountMinor, currency)} spent`}
            />
          </>
        ) : (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p id="hero-label" className="text-sm text-muted-foreground">
                Spent this month
              </p>
              <p className="mt-1 text-5xl font-semibold tracking-tight">{formatMoney(thisMonth.expenseMinor, currency)}</p>
              <p className="mt-2 text-sm text-muted-foreground">Set a monthly limit to see how much is left to spend.</p>
            </div>
            <Button nativeButton={false} render={<Link href="/budgets" />}>
              Set a limit
            </Button>
          </div>
        )}
      </section>

      <WaitingList
        currency={currency}
        today={today}
        items={waiting.map((w) => ({
          ruleId: w.rule.id,
          description: w.rule.description,
          type: w.rule.type,
          amountMinor: w.rule.amountMinor,
          dueOn: w.dueOn,
          pendingCount: w.pendingCount,
          walletName: w.walletName,
          categoryIcon: w.categoryIcon,
          categoryColor: w.categoryColor,
        }))}
      />

      <AlertList alerts={alerts} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Spent this month" value={formatMoney(thisMonth.expenseMinor, currency)}>
          {lastMonthSoFar.expenseMinor > 0 || thisMonth.expenseMinor > 0 ? (
            spendDelta === 0 ? (
              <span>Same as this time last month</span>
            ) : (
              <span className={cn("inline-flex items-center gap-1", spendDelta < 0 ? "text-primary" : "text-warning")}>
                {spendDelta < 0 ? <ArrowDownIcon className="size-3.5" aria-hidden /> : <ArrowUpIcon className="size-3.5" aria-hidden />}
                {formatMoney(Math.abs(spendDelta), currency)} {spendDelta < 0 ? "less" : "more"} than this time last month
              </span>
            )
          ) : (
            <span>Nothing yet</span>
          )}
        </StatTile>
        <StatTile label="Received this month" value={formatMoney(thisMonth.incomeMinor, currency)}>
          {thisMonth.incomeMinor - thisMonth.expenseMinor >= 0
            ? `${formatMoney(thisMonth.incomeMinor - thisMonth.expenseMinor, currency)} left over so far`
            : `${formatMoney(thisMonth.expenseMinor - thisMonth.incomeMinor, currency)} more spent than received`}
        </StatTile>
        <StatTile label="Total balance" value={formatMoney(totalBalance, currency)}>
          {setAside > 0 ? (
            <>
              {formatMoney(setAside, currency)} set aside for goals ·{" "}
              {formatMoney(totalBalance - setAside, currency)} free
            </>
          ) : (
            `Across ${wallets.length} ${wallets.length === 1 ? "wallet" : "wallets"}`
          )}
        </StatTile>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Budgets" href="/budgets" linkLabel="All budgets">
          {overview.categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No category budgets yet. Give the categories you overspend on a monthly limit.
            </p>
          ) : (
            <ul className="grid gap-4">
              {[...overview.categories]
                .sort((a, b) => b.ratio - a.ratio)
                .slice(0, 4)
                .map((b) => (
                  <li key={b.id} className="grid gap-2">
                    <div className="flex items-center gap-2 text-sm">
                      <CategoryIcon icon={b.categoryIcon} color={b.categoryColor} size="sm" />
                      <span className="min-w-0 flex-1 truncate">{b.categoryName}</span>
                      <span className="tabular text-right">
                        {b.remainingMinor >= 0
                          ? `${formatMoney(b.remainingMinor, currency)} left`
                          : `${formatMoney(-b.remainingMinor, currency)} over`}
                      </span>
                    </div>
                    <Meter
                      ratio={b.ratio}
                      level={b.level}
                      label={`${b.categoryName} budget`}
                      valueText={`${formatMoney(b.spentMinor, currency)} of ${formatMoney(b.availableMinor, currency)} spent`}
                    />
                    {b.level !== "ok" && <BudgetStatus level={b.level} />}
                  </li>
                ))}
            </ul>
          )}
        </Card>

        <Card title="Where your money went" href={`/transactions?month=${month}&type=expense`} linkLabel="Details">
          <CategoryBars rows={byCategory} currency={currency} month={month} />
        </Card>
      </div>

      <Card title="Income and spending" className="overflow-visible">
        <p className="-mt-3 text-sm text-muted-foreground">Last 6 months</p>
        <IncomeSpendingChart data={totals} currency={currency} currentMonth={month} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Coming up" href="/recurring" linkLabel="Recurring">
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing scheduled in the next two weeks. Add rent, salary or subscriptions once and they&apos;ll be
              recorded on their dates.
            </p>
          ) : (
            <ul className="grid gap-3">
              {upcoming.slice(0, 5).map((u) => (
                <li key={`${u.rule.id}-${u.date}`} className="flex items-center gap-3 text-sm">
                  <CategoryIcon icon={u.categoryIcon ?? (u.rule.type === "transfer" ? "repeat" : "receipt")} color={u.categoryColor} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{u.rule.description}</span>
                    <span className="block text-xs text-muted-foreground">
                      {capitalize(relativeDay(u.date, today))} · {u.rule.mode === "auto" ? "added automatically" : "asks first"}
                    </span>
                  </span>
                  <span className={cn("tabular shrink-0 text-right", u.rule.type === "income" && "text-primary")}>
                    {u.rule.type === "income" ? "+" : u.rule.type === "expense" ? "−" : ""}
                    {formatMoney(u.rule.amountMinor, currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Goals" href="/goals" linkLabel="All goals">
          {goals.length === 0 ? (
            <p className="text-sm text-muted-foreground">Saving for something? Add a goal to track it.</p>
          ) : (
            <ul className="grid gap-4">
              {goals.slice(0, 3).map((g) => {
                const p = goalProgress({ targetMinor: g.targetMinor, savedMinor: g.savedMinor, targetDate: g.targetDate, today });
                return (
                  <li key={g.id} className="grid gap-2">
                    <div className="flex items-center gap-2 text-sm">
                      <CategoryIcon icon={g.icon} color={g.color} size="sm" />
                      <span className="min-w-0 flex-1 truncate">{g.name}</span>
                      <span className="tabular text-right">
                        {formatMoney(g.savedMinor, currency)}
                        <span className="text-muted-foreground"> of {formatMoney(g.targetMinor, currency)}</span>
                      </span>
                    </div>
                    <Meter
                      ratio={p.ratio}
                      label={`${g.name} progress`}
                      valueText={`${formatMoney(g.savedMinor, currency)} of ${formatMoney(g.targetMinor, currency)} saved`}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4">
        <Card title="Recent entries" href="/transactions" linkLabel="All entries">
          {recent.length === 0 ? (
            <div className="grid justify-items-start gap-3">
              <p className="text-sm text-muted-foreground">Nothing recorded yet. Add what you spent today.</p>
              <AddEntryButton />
            </div>
          ) : (
            <ul className="-mx-5 -mb-5 divide-y divide-dashed divide-border border-t border-border">
              {recent.map((row) => (
                <li key={row.id}>
                  <TransactionRowButton row={row} currency={currency} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-6">
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-40 w-full rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
      <Skeleton className="h-72 w-full rounded-2xl" />
    </div>
  );
}
