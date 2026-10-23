import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { PreferencesForm } from "@/components/settings/preferences-form";
import { SignOutButton } from "@/components/settings/sign-out-button";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { currencyOptions, timeZoneOptions } from "@/lib/preferences-options";
import { requireUser } from "@/server/session";

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
    <section className="grid gap-6 border-t border-border py-8 md:grid-cols-[14rem_1fr] md:gap-10">
      <div>
        <h2 className="font-medium">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="max-w-md">{children}</div>
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
      <Section title="Appearance" description="Applies on this device.">
        <ThemeSwitcher />
      </Section>
    </>
  );
}

async function SettingsContent() {
  const user = await requireUser();
  const currency = user.currency ?? "INR";
  const timezone = user.timezone ?? "Asia/Kolkata";

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
