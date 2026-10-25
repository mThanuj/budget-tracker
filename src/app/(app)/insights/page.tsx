import { tz } from "@date-fns/tz";
import { format } from "date-fns";
import Link from "next/link";
import { type ReactNode, Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { FactsView } from "@/components/insights/facts-view";
import { ProTeaser } from "@/components/insights/pro-teaser";
import { ReportView } from "@/components/insights/report-view";
import { ReportWriter } from "@/components/insights/report-writer";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMonth } from "@/lib/date-format";
import { addMonths, monthOf, todayInTz } from "@/lib/dates";
import { MIN_ENTRIES_FOR_INSIGHTS } from "@/lib/insights";
import { aiAvailableFor } from "@/server/ai";
import { getUserPlan } from "@/server/billing/plan";
import { razorpayConfig } from "@/server/billing/razorpay";
import { db } from "@/server/db";
import { buildInsightFacts, factsHash } from "@/server/services/insight-facts";
import { getInsight, refreshesUsed } from "@/server/services/insights";
import { requireUser } from "@/server/session";
import { userCurrency, userTimeZone } from "@/lib/user-prefs";

export const metadata = { title: "Insights" };

export default function InsightsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Insights" description="How your money went, and what to keep an eye on." />
      <Suspense fallback={<InsightsSkeleton />}>
        <InsightsContent />
      </Suspense>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-5 rounded-2xl bg-card p-5 ring-1 ring-foreground/10 sm:p-6">
      <h2 id={id} className="font-heading text-xl">
        {title}
      </h2>
      {children}
    </section>
  );
}

const SettingsLink = () => (
  <Link href="/settings" className="text-primary underline-offset-4 hover:underline">
    Settings
  </Link>
);

async function InsightsContent() {
  const user = await requireUser();
  const currency = userCurrency(user);
  const timeZone = userTimeZone(user);
  const today = todayInTz(timeZone);
  const thisMonth = monthOf(today);
  const lastMonth = addMonths(thisMonth, -1);

  const [plan, last, soFar, report, checkIn, used] = await Promise.all([
    getUserPlan(db, user.id),
    buildInsightFacts(db, user.id, { kind: "month", month: lastMonth, today, currency }),
    buildInsightFacts(db, user.id, { kind: "so_far", month: thisMonth, today, currency }),
    getInsight(db, user.id, "month", lastMonth),
    getInsight(db, user.id, "so_far", thisMonth),
    refreshesUsed(db, user.id, thisMonth),
  ]);
  const pro = plan.limits.insights;
  const ai = aiAvailableFor(user);
  const teaser = !pro && razorpayConfig() !== null;
  const rewritesLeft = Math.max(plan.limits.insightRefreshesPerMonth - used, 0);
  const rewritesNote = `${rewritesLeft} ${rewritesLeft === 1 ? "rewrite" : "rewrites"} left this month`;
  const writtenOn = (d: Date) => format(d, "d MMM, h:mm a", { in: tz(timeZone) });
  const enough = (n: number) => n >= MIN_ENTRIES_FOR_INSIGHTS;

  return (
    <div className="grid gap-6">
      <Section id="last-month" title={formatMonth(lastMonth)}>
        {!enough(last.entries) ? (
          <p className="text-muted-foreground">
            {last.entries === 0 ? "Nothing was recorded" : `Only ${last.entries} ${last.entries === 1 ? "entry was" : "entries were"} recorded`}{" "}
            in {formatMonth(lastMonth)}. Reports start once a month has at least {MIN_ENTRIES_FOR_INSIGHTS} entries; your
            report for {formatMonth(thisMonth)} will be here on 1 {formatMonth(addMonths(thisMonth, 1)).split(" ")[0]}.
          </p>
        ) : (
          <>
            {pro && ai && report && <ReportView report={report.report} />}
            {pro && ai && report && report.factsHash !== factsHash(last) && (
              <ReportWriter
                kind="month"
                label="Update report"
                note={`Entries for ${formatMonth(lastMonth)} changed since this was written · ${rewritesNote}`}
              />
            )}
            {pro && ai && !report && <ReportWriter kind="month" auto label="Write report" />}
            {pro && !ai && (
              <p className="text-sm text-muted-foreground">
                Switch AI features on in <SettingsLink /> to get this month written up.
              </p>
            )}
            {teaser && <ProTeaser period={formatMonth(lastMonth).split(" ")[0]} />}
            <FactsView facts={last} />
          </>
        )}
      </Section>

      <Section id="so-far" title={`${formatMonth(thisMonth).split(" ")[0]} so far`}>
        {!enough(soFar.entries) ? (
          <p className="text-muted-foreground">
            A check-in needs at least {MIN_ENTRIES_FOR_INSIGHTS} entries this month. Keep adding them as you go.
          </p>
        ) : (
          <>
            {pro && ai && checkIn && <ReportView report={checkIn.report} footnote={`Checked in ${writtenOn(checkIn.createdAt)}.`} />}
            {pro && ai && (
              <ReportWriter kind="so_far" label={checkIn ? "Check in again" : "Check in on this month"} note={rewritesNote} />
            )}
            <FactsView facts={soFar} />
          </>
        )}
      </Section>
    </div>
  );
}

function InsightsSkeleton() {
  return (
    <div className="grid gap-6">
      <Skeleton className="h-80 w-full rounded-2xl" />
      <Skeleton className="h-48 w-full rounded-2xl" />
    </div>
  );
}
