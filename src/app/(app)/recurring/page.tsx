import { Suspense } from "react";
import { z } from "zod";
import { PageHeader } from "@/components/app/page-header";
import { RecurringManager } from "@/components/recurring/recurring-manager";
import { toRuleItem } from "@/components/recurring/rule-item";
import { WaitingList } from "@/components/recurring/waiting-list";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/server/db";
import { syncRecurring } from "@/server/recurring-sync";
import { listCategories } from "@/server/services/categories";
import { listAwaitingConfirmation, listRules, listSubscriptionSuggestions } from "@/server/services/recurring";
import { listWallets } from "@/server/services/wallets";
import { requireUser } from "@/server/session";
import { userCurrency, userToday } from "@/lib/user-prefs";

export const metadata = { title: "Recurring" };

export default function RecurringPage({ searchParams }: PageProps<"/recurring">) {
  return (
    <>
      <PageHeader title="Recurring" description="Rent, salary, EMIs, bills and subscriptions that repeat." />
      <Suspense fallback={<RecurringSkeleton />}>
        <RecurringContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function RecurringContent({ searchParams }: Pick<PageProps<"/recurring">, "searchParams">) {
  const user = await requireUser();
  await syncRecurring(user);
  const currency = userCurrency(user);
  const today = userToday(user);
  const { view } = z
    .object({ view: z.enum(["all", "subscriptions"]).optional().catch(undefined) })
    .parse(await searchParams);

  const [rules, waiting, suggestions, wallets, categories] = await Promise.all([
    listRules(db, user.id),
    listAwaitingConfirmation(db, user.id, today),
    listSubscriptionSuggestions(db, user.id, today),
    listWallets(db, user.id, { includeArchived: true }),
    listCategories(db, user.id, { includeArchived: true }),
  ]);

  return (
    <div className="grid gap-6">
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
      <RecurringManager
        initialView={view ?? "all"}
        rules={rules.map(toRuleItem)}
        suggestions={suggestions.map((s) => ({
          merchantKey: s.merchantKey,
          name: s.name,
          amountMinor: s.amountMinor,
          frequency: s.frequency,
          lastOn: s.lastOn,
          occurrences: s.occurrences,
        }))}
        data={{
          currency,
          today,
          defaultWalletId: user.defaultWalletId ?? null,
          wallets: wallets.map((w) => ({ id: w.id, name: w.name, archived: w.archivedAt !== null })),
          categories: categories.map((c) => ({
            id: c.id,
            name: c.name,
            kind: c.kind,
            icon: c.icon,
            color: c.color,
            archived: c.archivedAt !== null,
          })),
        }}
      />
    </div>
  );
}

function RecurringSkeleton() {
  return (
    <div className="grid gap-6">
      <Skeleton className="h-9 w-72 rounded-xl" />
      <Skeleton className="h-72 w-full rounded-2xl" />
    </div>
  );
}
