import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { AddWalletButton, MoveMoneyButton, WalletCard } from "@/components/wallets/wallet-card";
import { formatMoney } from "@/lib/money";
import { db } from "@/server/db";
import { totalSetAside } from "@/server/services/goals";
import { listWallets } from "@/server/services/wallets";
import { syncRecurring } from "@/server/recurring-sync";
import { requireUser } from "@/server/session";

export const metadata = { title: "Wallets" };

export default function WalletsPage() {
  return (
    <>
      <PageHeader title="Wallets" description="Where your money lives: bank accounts, cards and cash." />
      <Suspense fallback={<WalletsSkeleton />}>
        <WalletsContent />
      </Suspense>
    </>
  );
}

async function WalletsContent() {
  const user = await requireUser();
  await syncRecurring(user);
  const currency = user.currency ?? "INR";
  const defaultWalletId = (user.defaultWalletId as string | null | undefined) ?? null;
  const [wallets, setAside] = await Promise.all([
    listWallets(db, user.id, { includeArchived: true }),
    totalSetAside(db, user.id),
  ]);
  const active = wallets.filter((w) => !w.archivedAt);
  const archived = wallets.filter((w) => w.archivedAt);

  // Net worth across active wallets: card balances are negative (owed).
  const total = active.reduce((sum, w) => sum + w.balanceMinor, 0);
  const owedOnCards = active
    .filter((w) => w.kind === "credit_card" && w.balanceMinor < 0)
    .reduce((sum, w) => sum - w.balanceMinor, 0);

  const toCard = (w: (typeof wallets)[number]) => ({
    id: w.id,
    name: w.name,
    kind: w.kind,
    color: w.color,
    openingBalanceMinor: w.openingBalanceMinor,
    balanceMinor: w.balanceMinor,
    entryCount: w.entryCount,
    archived: w.archivedAt !== null,
    isDefault: w.id === defaultWalletId,
  });

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
        <div>
          <p className="text-sm text-muted-foreground">Total across wallets</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight">{formatMoney(total, currency)}</p>
          {owedOnCards > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              After subtracting {formatMoney(owedOnCards, currency)} owed on cards
            </p>
          )}
          {setAside > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              {formatMoney(setAside, currency)} of it is set aside for goals, so{" "}
              {formatMoney(total - setAside, currency)} is free to use
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {active.length >= 2 && <MoveMoneyButton />}
          <AddWalletButton currency={currency} />
        </div>
      </div>

      {active.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
          <h2 className="font-heading text-xl">No wallets yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-muted-foreground">
            Add the places you keep money, like your bank account, credit card or cash, so every entry has a home.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {active.map((w) => (
            <WalletCard key={w.id} wallet={toCard(w)} currency={currency} />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm text-muted-foreground select-none hover:text-foreground">
            Archived wallets ({archived.length})
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {archived.map((w) => (
              <WalletCard key={w.id} wallet={toCard(w)} currency={currency} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function WalletsSkeleton() {
  return (
    <div className="grid gap-8">
      <Skeleton className="h-28 w-full rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-44 rounded-2xl" />
        <Skeleton className="h-44 rounded-2xl" />
      </div>
    </div>
  );
}
