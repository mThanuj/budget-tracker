import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { LegalLinks } from "@/components/legal/legal-links";
import { AiToggle } from "@/components/settings/ai-toggle";
import { DeleteAccount } from "@/components/settings/delete-account";
import { PreferencesForm } from "@/components/settings/preferences-form";
import { SignOutButton } from "@/components/settings/sign-out-button";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "cn";
import { Skeleton } from "@/components/ui/skeleton";
import { billingEnabled } from "@/config/features";
import { currencyOptions, timeZoneOptions } from "@/lib/preferences-options";
import { aiConfigured } from "@/server/ai";
import { getUserPlan } from "@/server/billing/plan";
import { db } from "@/server/db";
import { requireUser } from "@/server/session";
import { userCurrency, userTimeZone } from "@/lib/user-prefs";

export const metadata = { title: "Settings" };

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    // minmax(0, …): a long email truncates instead of widening the column.
    <section className="grid grid-cols-1 gap-6 border-t border-border py-8 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-10">
      <div>
        <h2 className="font-medium">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="min-w-0 max-w-md">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsContent />
      </Suspense>
      {billingEnabled() && (
        <Section title="Plan" description="Free, or Pro for more AI help.">
          <Link
            href="/billing"
            className="inline-flex items-center gap-1 rounded text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Plan & billing
            <ChevronRightIcon className="size-4" aria-hidden />
          </Link>
        </Section>
      )}
      <Section title="Categories" description="Add, rename or archive the groups your entries go into.">
        <Link
          href="/categories"
          className="inline-flex items-center gap-1 rounded text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Manage categories
          <ChevronRightIcon className="size-4" aria-hidden />
        </Link>
      </Section>
      <Section title="Appearance" description="Applies on this device.">
        <ThemeSwitcher />
      </Section>
      <Suspense>
        <YourData />
      </Suspense>
      <LegalLinks className="border-t border-border pt-6 text-sm text-muted-foreground" />
    </>
  );
}

async function YourData() {
  const user = await requireUser();
  const plan = await getUserPlan(db, user.id);
  return (
    <Section title="Your data" description="Take a copy whenever you like, or delete everything.">
      <div className="grid gap-6">
        <div className="grid gap-2">
          {/* A plain link: the browser downloads the file. */}
          <a href="/api/export" download className={cn(buttonVariants({ variant: "outline" }), "justify-self-start")}>
            Download entries (CSV)
          </a>
          <p className="text-sm text-muted-foreground">Every entry, for Excel, Google Sheets or anything else.</p>
        </div>
        <div className="grid gap-2">
          <div>
            <DeleteAccount pro={plan.id === "pro" && plan.subscription?.renewsAt != null} />
          </div>
          <p className="text-sm text-muted-foreground">Removes your account and everything in it.</p>
        </div>
      </div>
    </Section>
  );
}

async function SettingsContent() {
  const user = await requireUser();
  const currency = userCurrency(user);
  const timezone = userTimeZone(user);

  return (
    <>
      <Section title="Account" description="You sign in with Google.">
        <div className="flex items-center gap-4">
          <Avatar size="lg">
            {user.image && <AvatarImage src={user.image} alt="" referrerPolicy="no-referrer" />}
            <AvatarFallback>{user.name.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{user.name}</p>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          </div>
          <SignOutButton />
        </div>
      </Section>
      {aiConfigured() && (
        <Section title="AI features" description="Fill in entries from a sentence, get category suggestions, ask questions and read reports.">
          <AiToggle enabled={user.aiEnabled !== false} />
        </Section>
      )}
      <Section title="Money" description="How amounts and dates work for you.">
        <PreferencesForm
          mode="settings"
          currency={currency}
          timezone={timezone}
          currencies={currencyOptions()}
          timeZones={timeZoneOptions([timezone])}
        />
      </Section>
    </>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-4 border-t border-border py-8">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-9 w-full max-w-md" />
      <Skeleton className="h-9 w-full max-w-md" />
    </div>
  );
}
