import { Suspense } from "react";
import { z } from "zod";
import { cn } from "cn";
import { MonthSwitcher } from "@/components/app/month-switcher";
import { PageHeader } from "@/components/app/page-header";
import { AddEntryButton } from "@/components/transactions/add-entry-button";
import { type FilterValues, TransactionFilters } from "@/components/transactions/transaction-filters";
import { TransactionRowButton } from "@/components/transactions/transaction-row";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { formatDateRange, formatDay, formatMonth } from "@/lib/date-format";
import { addDays, monthOf, monthRange } from "@/lib/dates";
import { entrySearchHref, parseEntrySearch, SEARCH_MAX, SEARCH_PAGE } from "@/lib/entry-search";
import { formatMoney } from "@/lib/money";
import { db } from "@/server/db";
import { listCategories } from "@/server/services/categories";
import {
  listTransactions,
  summarizeTransactions,
  type TransactionFilters as Filters,
  type TransactionRow,
} from "@/server/services/transactions";
import { listWallets } from "@/server/services/wallets";
import { syncRecurring } from "@/server/recurring-sync";
import { requireUser } from "@/server/session";
import { userCurrency, userToday } from "@/lib/user-prefs";
import { EmptyState } from "@/components/app/empty-state";

export const metadata = { title: "Entries" };

export default function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  return (
    <>
      <PageHeader title="Entries" actions={<AddEntryButton className="hidden md:inline-flex" />} />
      <Suspense fallback={<TransactionsSkeleton />}>
        <TransactionsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const paramsSchema = z.object({
  wallet: z.uuid().optional().catch(undefined),
  category: z
    .union([z.uuid(), z.literal("none")])
    .optional()
    .catch(undefined),
  type: z.enum(["income", "expense", "transfer"]).optional().catch(undefined),
  q: z.string().max(100).optional().catch(undefined),
});

function groupByDay(rows: TransactionRow[]) {
  const groups: { date: string; rows: TransactionRow[]; spentMinor: number }[] = [];
  for (const row of rows) {
    let group = groups.at(-1);
    if (group?.date !== row.occurredOn) {
      group = { date: row.occurredOn, rows: [], spentMinor: 0 };
      groups.push(group);
    }
    group.rows.push(row);
    if (row.type === "expense") group.spentMinor += row.amountMinor;
  }
  return groups;
}

async function TransactionsContent({ searchParams }: Pick<PageProps<"/transactions">, "searchParams">) {
  const user = await requireUser();
  await syncRecurring(user);
  const currency = userCurrency(user);
  const today = userToday(user);
  const raw = await searchParams;
  const first = (k: string) => {
    const v = raw[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const params = paramsSchema.parse(Object.fromEntries(Object.keys(raw).map((k) => [k, first(k)])));
  const search = parseEntrySearch(
    {
      month: first("month"),
      period: first("period"),
      from: first("from"),
      to: first("to"),
      min: first("min"),
      max: first("max"),
      limit: first("limit"),
    },
    { currency, today },
  );
  const { period } = search;
  const range =
    period.mode === "month"
      ? monthRange(period.month)
      : { start: period.from, end: period.to ? addDays(period.to, 1) : undefined };
  const filters: Filters = {
    from: range.start,
    to: range.end,
    walletId: params.wallet,
    categoryId: params.category,
    type: params.type,
    q: params.q,
    minMinor: search.minMinor,
    maxMinor: search.maxMinor,
  };
  // One month shows up to 500; across months, the latest `limit` ("Show 200 more").
  const limit = period.mode === "month" ? 500 : search.limit;

  const [rows, summary, wallets, categories] = await Promise.all([
    listTransactions(db, user.id, filters, limit),
    summarizeTransactions(db, user.id, filters),
    listWallets(db, user.id, { includeArchived: true }),
    listCategories(db, user.id, { includeArchived: true }),
  ]);

  const values: FilterValues = {
    wallet: params.wallet,
    category: params.category,
    type: params.type,
    q: params.q,
    min: search.minMinor !== undefined ? first("min")?.trim() : undefined,
    max: search.maxMinor !== undefined ? first("max")?.trim() : undefined,
    ...(period.mode === "month"
      ? { month: period.month }
      : period.from || period.to
        ? { from: period.from, to: period.to }
        : { period: "all" }),
  };
  const filtered = Boolean(values.wallet || values.category || values.type || values.q || values.min || values.max);
  const monthHref = (m: string) =>
    entrySearchHref({ ...values, period: undefined, from: undefined, to: undefined, month: m });
  const left = summary.incomeMinor - summary.expenseMinor;
  const more = period.mode === "range" && summary.count > rows.length && rows.length < SEARCH_MAX;

  return (
    <div className="grid gap-6">
      {period.mode === "month" ? (
        <MonthSwitcher month={period.month} currentMonth={monthOf(today)} href={monthHref} />
      ) : (
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-heading text-xl">{formatDateRange(period.from, period.to)}</h2>
          <Link href={monthHref(monthOf(today))} className="text-sm text-primary underline-offset-4 hover:underline">
            Back to months
          </Link>
        </div>
      )}

      <dl className="grid grid-cols-3 divide-x divide-border rounded-2xl bg-card ring-1 ring-foreground/10">
        {[
          { label: "Received", value: formatMoney(summary.incomeMinor, currency), tone: "text-primary" },
          { label: "Spent", value: formatMoney(summary.expenseMinor, currency), tone: "" },
          {
            label: left >= 0 ? "Left over" : "Overspent",
            value: formatMoney(Math.abs(left), currency),
            tone: left < 0 ? "text-warning" : "",
          },
        ].map((s) => (
          <div key={s.label} className="px-3 py-3.5 sm:px-5">
            <dt className="text-xs text-muted-foreground sm:text-sm">{s.label}</dt>
            <dd className={cn("mt-1 truncate text-sm font-semibold sm:text-lg", s.tone)}>{s.value}</dd>
          </div>
        ))}
      </dl>

      <TransactionFilters
        values={values}
        thisMonth={monthOf(today)}
        wallets={wallets.map((w) => ({ id: w.id, name: w.name }))}
        expenseCategories={categories.filter((c) => c.kind === "expense").map((c) => ({ id: c.id, name: c.name }))}
        incomeCategories={categories.filter((c) => c.kind === "income").map((c) => ({ id: c.id, name: c.name }))}
      />

      {rows.length === 0 ? (
        <EmptyState
          headingLevel={3}
          title={
            filtered || period.mode === "range"
              ? "No entries match these filters"
              : `Nothing recorded in ${formatMonth(period.month).split(" ")[0]}`
          }
          action={!filtered && period.mode === "month" && <AddEntryButton />}
        >
          {filtered || period.mode === "range"
            ? "Try a different wallet, category, search word, amount or dates."
            : "Add what you spend and receive, and it will show up here day by day."}
        </EmptyState>
      ) : (
        <div className="grid gap-5">
          {groupByDay(rows).map((g) => (
            <section
              key={g.date}
              aria-label={formatDay(g.date, today)}
              className="overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10"
            >
              <header className="flex items-baseline justify-between gap-3 border-b border-border bg-muted/50 px-4 py-2 text-sm sm:px-5">
                <h3 className="font-medium">{formatDay(g.date, today)}</h3>
                {g.spentMinor > 0 && (
                  <span className="tabular text-xs text-muted-foreground">
                    {formatMoney(g.spentMinor, currency)} spent
                  </span>
                )}
              </header>
              <ul className="divide-y divide-dashed divide-border">
                {g.rows.map((row) => (
                  <li key={row.id}>
                    <TransactionRowButton row={row} currency={currency} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {period.mode === "month" && rows.length >= 500 && (
            <p className="text-center text-sm text-muted-foreground">
              Showing the latest 500 entries. Use filters to narrow it down.
            </p>
          )}
          {period.mode === "range" && summary.count > rows.length && (
            <div className="grid justify-items-center gap-2 text-center text-sm text-muted-foreground">
              <p>
                {summary.count.toLocaleString("en-IN")} entries match; showing the latest{" "}
                {rows.length.toLocaleString("en-IN")}.{!more && " Narrow the dates or filters to see older ones."}
              </p>
              {more && (
                <Link
                  href={entrySearchHref({ ...values, limit: String(rows.length + SEARCH_PAGE) })}
                  scroll={false}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Show {SEARCH_PAGE} more
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TransactionsSkeleton() {
  return (
    <div className="grid gap-6">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-20 w-full rounded-2xl" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );
}
