import { Suspense } from "react";
import { z } from "zod";
import { MonthSwitcher } from "@/components/app/month-switcher";
import { PageHeader } from "@/components/app/page-header";
import { type BudgetRowData, CategoryBudgets, OverallBudgetCard } from "@/components/budgets/budget-list";
import { Skeleton } from "@/components/ui/skeleton";
import { daysLeftInMonth, suggestLimit } from "@/lib/budgets";
import { isISOMonth } from "@/lib/date-format";
import { monthOf, todayInTz } from "@/lib/dates";
import { db } from "@/server/db";
import { averageMonthlySpending, getBudgetOverview, unbudgetedCategories } from "@/server/services/budgets";
import { syncRecurring } from "@/server/recurring-sync";
import { requireUser } from "@/server/session";

export const metadata = { title: "Budgets" };

export default function BudgetsPage({ searchParams }: PageProps<"/budgets">) {
  return (
    <>
      <PageHeader title="Budgets" description="Plan how much to spend each month, and see how you're doing." />
      <Suspense fallback={<BudgetsSkeleton />}>
        <BudgetsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function BudgetsContent({ searchParams }: Pick<PageProps<"/budgets">, "searchParams">) {
  const user = await requireUser();
  await syncRecurring(user);
  const currency = user.currency ?? "INR";
  const today = todayInTz(user.timezone ?? "Asia/Kolkata");
  const currentMonth = monthOf(today);
  const raw = z.object({ month: z.string().optional().catch(undefined) }).parse(await searchParams);
  const month = isISOMonth(raw.month) ? raw.month : currentMonth;

  const [overview, averages, unbudgeted] = await Promise.all([
    getBudgetOverview(db, user.id, month),
    averageMonthlySpending(db, user.id, currentMonth),
    unbudgetedCategories(db, user.id),
  ]);

  const suggestions: Record<string, number> = {};
  for (const [key, avg] of averages) {
    const s = suggestLimit(avg, currency);
    if (s) suggestions[key ?? "overall"] = s;
  }
  const toRow = (b: (typeof overview.categories)[number]): BudgetRowData => ({
    id: b.id,
    categoryId: b.categoryId,
    categoryName: b.categoryName,
    categoryIcon: b.categoryIcon,
    categoryColor: b.categoryColor,
    categoryArchived: Boolean(b.categoryArchived),
    amountMinor: b.amountMinor,
    rollover: b.rollover,
    carryInMinor: b.carryInMinor,
    spentMinor: b.spentMinor,
    availableMinor: b.availableMinor,
    remainingMinor: b.remainingMinor,
    ratio: b.ratio,
    level: b.level,
  });
  const shared = { currency, suggestions, unbudgeted, month };

  return (
    <div className="grid gap-8">
      <MonthSwitcher month={month} currentMonth={currentMonth} href={(m) => `/budgets?month=${m}`} />
      <OverallBudgetCard
        {...shared}
        overall={overview.overall ? toRow(overview.overall) : null}
        totalSpentMinor={overview.totalSpentMinor}
        daysLeft={daysLeftInMonth(month, today)}
      />
      <CategoryBudgets
        {...shared}
        budgets={[...overview.categories].sort((a, b) => b.ratio - a.ratio).map(toRow)}
        unbudgetedMinor={overview.unbudgetedMinor}
      />
    </div>
  );
}

function BudgetsSkeleton() {
  return (
    <div className="grid gap-8">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-36 w-full rounded-2xl" />
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );
}
