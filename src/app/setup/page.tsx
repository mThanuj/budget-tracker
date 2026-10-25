import Link from "next/link";
import { Suspense } from "react";
import { Brand } from "@/components/app/brand";
import { SetupFlow } from "@/components/setup/setup-flow";
import { Skeleton } from "@/components/ui/skeleton";
import { aiAvailableFor } from "@/server/ai";
import { db } from "@/server/db";
import { listCategories } from "@/server/services/categories";
import { listWallets } from "@/server/services/wallets";
import { requireUser } from "@/server/session";
import { userCurrency, userToday } from "@/lib/user-prefs";

export const metadata = { title: "Plan your money" };

export default function SetupPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 py-6 sm:px-8">
      <div className="flex items-center justify-between">
        <Brand href="/dashboard" />
        <Link href="/dashboard" className="link-quiet text-sm text-muted-foreground">
          Skip for now
        </Link>
      </div>
      <main className="flex-1 py-10">
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
          <SetupContent />
        </Suspense>
      </main>
    </div>
  );
}

async function SetupContent() {
  const user = await requireUser();
  const [wallets, categories] = await Promise.all([listWallets(db, user.id), listCategories(db, user.id)]);
  return (
    <SetupFlow
      currency={userCurrency(user)}
      today={userToday(user)}
      ai={aiAvailableFor(user)}
      existingWallets={wallets.map((w) => ({ name: w.name, kind: w.kind }))}
      expenseCategories={categories
        .filter((c) => c.kind === "expense")
        .map((c) => ({ id: c.id, name: c.name, icon: c.icon, color: c.color }))}
    />
  );
}
