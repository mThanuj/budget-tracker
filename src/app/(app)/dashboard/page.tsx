import { tz } from "@date-fns/tz";
import { format } from "date-fns";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/server/session";

export const metadata = { title: "Home" };

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

async function DashboardContent() {
  const user = await requireUser();
  if (!user.onboardedAt) redirect("/welcome");
  const firstName = user.name.split(" ")[0];

  return (
    <>
      <h1 className="mb-8 font-heading text-3xl tracking-tight">
        {greeting(user.timezone ?? "Asia/Kolkata")}, {firstName}.
      </h1>
      <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
        <h2 className="font-heading text-xl">Nothing to show yet</h2>
        <p className="mx-auto mt-2 max-w-sm text-muted-foreground">
          Once you add wallets and entries, this page shows your balance, this month&apos;s
          spending and how your budgets are doing.
        </p>
      </div>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-48 w-full rounded-2xl" />
    </div>
  );
}
