import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Brand } from "@/components/app/brand";
import { PreferencesForm } from "@/components/settings/preferences-form";
import { Skeleton } from "@/components/ui/skeleton";
import { currencyOptions, timeZoneOptions } from "@/lib/preferences-options";
import { requireUser } from "@/server/session";
import { userCurrency, userTimeZone } from "@/lib/user-prefs";

export const metadata = { title: "Welcome" };

export default function WelcomePage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 py-6 sm:px-8">
      <Brand href="/dashboard" />
      <main className="flex flex-1 flex-col justify-center py-12">
        <Suspense fallback={<WelcomeSkeleton />}>
          <WelcomeContent />
        </Suspense>
      </main>
    </div>
  );
}

async function WelcomeContent() {
  const user = await requireUser();
  if (user.onboardedAt) redirect("/dashboard");
  const firstName = user.name.split(" ")[0];

  return (
    <>
      <h1 className="font-heading text-4xl tracking-tight">Welcome, {firstName}.</h1>
      <p className="mt-3 mb-10 text-lg text-muted-foreground">
        Two quick settings and you&apos;re ready to add your first entry.
      </p>
      <PreferencesForm
        mode="welcome"
        currency={userCurrency(user)}
        timezone={userTimeZone(user)}
        currencies={currencyOptions()}
        timeZones={timeZoneOptions([userTimeZone(user)])}
      />
    </>
  );
}

function WelcomeSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-6 w-80" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}
