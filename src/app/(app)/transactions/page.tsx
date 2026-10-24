import { Suspense } from "react";
import { z } from "zod";
import { cn } from "cn";
import { MonthSwitcher } from "@/components/app/month-switcher";
import { PageHeader } from "@/components/app/page-header";
import { AddEntryButton } from "@/components/transactions/add-entry-button";
import { type FilterValues, TransactionFilters } from "@/components/transactions/transaction-filters";
import { TransactionRowButton } from "@/components/transactions/transaction-row";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDay, formatMonth, isISOMonth } from "@/lib/date-format";
import { monthOf, monthRange, todayInTz } from "@/lib/dates";
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
  month: z.string().optional(),
  wallet: z.uuid().optional().catch(undefined),
  category: z.union([z.uuid(), z.literal("none")]).optional().catch(undefined),
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
  const currency = user.currency ?? "INR";
  const today = todayInTz(user.timezone ?? "Asia/Kolkata");
  const raw = await searchParams;
  const params = paramsSchema.parse(
    Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
  );
  const month = isISOMonth(params.month) ? params.month : monthOf(today);
  const { start, end } = monthRange(month);
  const filters: Filters = {
    from: start,
    to: end,
    walletId: params.wallet,
    categoryId: params.category,
    type: params.type,
    q: params.q,
  };

  const [rows, summary, wallets, categories] = await Promise.all([
    listTransactions(db, user.id, filters),
    summarizeTransactions(db, user.id, filters),
    listWallets(db, user.id, { includeArchived: true }),
    listCategories(db, user.id, { includeArchived: true }),
  ]);

  const values: FilterValues = { wallet: params.wallet, category: params.category, type: params.type, q: params.q };
  const filtered = Boolean(values.wallet || values.category || values.type || values.q);
  const keep = new URLSearchParams(
    Object.entries(values).filter((e): e is [string, string] => Boolean(e[1])),
  );
  const monthHref = (m: string) => `/transactions?${new URLSearchParams({ month: m, ...Object.fromEntries(keep) })}`;
  const left = summary.incomeMinor - summary.expenseMinor;

  return (
    <div className="grid gap-6">
      <MonthSwitcher month={month} currentMonth={monthOf(today)} href={monthHref} />

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
        month={month}
        values={values}
        wallets={wallets.map((w) => ({ id: w.id, name: w.name }))}
        expenseCategories={categories.filter((c) => c.kind === "expense").map((c) => ({ id: c.id, name: c.name }))}
        incomeCategories={categories.filter((c) => c.kind === "income").map((c) => ({ id: c.id, name: c.name }))}
      />

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
          <h3 className="font-heading text-xl">
            {filtered ? "No entries match these filters" : `Nothing recorded in ${formatMonth(month).split(" ")[0]}`}
          </h3>
          <p className="mx-auto mt-2 max-w-sm text-muted-foreground">
            {filtered
              ? "Try a different wallet, category or search word."
              : "Add what you spend and receive, and it will show up here day by day."}
          </p>
          {!filtered && <AddEntryButton className="mt-6" />}
        </div>
      ) : (
        <div className="grid gap-5">
          {groupByDay(rows).map((g) => (
            <section key={g.date} aria-label={formatDay(g.date, today)} className="overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10">
              <header className="flex items-baseline justify-between gap-3 border-b border-border bg-muted/50 px-4 py-2 text-sm sm:px-5">
                <h3 className="font-medium">{formatDay(g.date, today)}</h3>
                {g.spentMinor > 0 && (
                  <span className="tabular text-xs text-muted-foreground">{formatMoney(g.spentMinor, currency)} spent</span>
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
          {rows.length >= 500 && (
            <p className="text-center text-sm text-muted-foreground">Showing the latest 500 entries. Use filters to narrow it down.</p>
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
