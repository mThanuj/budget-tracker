import { tz } from "@date-fns/tz";
import { format } from "date-fns";
import { TriangleAlertIcon } from "lucide-react";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { Activating } from "@/components/billing/activating";
import { CancelRenewal } from "@/components/billing/cancel-renewal";
import { PlanComparison } from "@/components/billing/plan-comparison";
import { UpgradePanel } from "@/components/billing/upgrade-panel";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { billingEnabled } from "@/config/features";
import { type BillingInterval, priceLabel } from "@/config/plans";
import { getUserPlan } from "@/server/billing/plan";
import { razorpayConfig } from "@/server/billing/razorpay";
import { isConfirming, unsettledSubscriptions } from "@/server/billing/subscriptions";
import { db } from "@/server/db";
import { requireUser } from "@/server/session";

export const metadata = { title: "Plan & billing" };

export default function BillingPage() {
  if (!billingEnabled()) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Plan & billing" description="Everything you track is free. Pro adds more AI help." />
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <BillingContent />
      </Suspense>
    </div>
  );
}

const card = "grid gap-4 rounded-2xl bg-card p-5 ring-1 ring-foreground/10 sm:p-6";

async function BillingContent() {
  const user = await requireUser();
  const [plan, unsettled] = await Promise.all([getUserPlan(db, user.id), unsettledSubscriptions(db, user.id)]);
  const billing = razorpayConfig() !== null;
  const day = (d: Date) => format(d, "d MMM yyyy", { in: tz(user.timezone ?? "Asia/Kolkata") });
  const sub = plan.subscription;
  const activating = plan.id === "free" && unsettled.some((s) => isConfirming(s));

  return (
    <div className="grid gap-6">
      <section aria-labelledby="current-plan" className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="current-plan" className="flex items-center gap-2 font-heading text-xl">
            Your plan: {plan.limits.name}
            {sub?.paymentProblem && <Badge variant="outline">Payment due</Badge>}
          </h2>
          {sub?.renewsAt && billing && <CancelRenewal until={day(sub.renewsAt)} />}
        </div>
        {sub ? (
          <div className="grid gap-2 text-sm">
            {sub.renewsAt && (
              <p>
                Renews on {day(sub.renewsAt)} · {priceLabel(sub.interval as BillingInterval)}
              </p>
            )}
            {sub.endsAt && <p>Pro until {day(sub.endsAt)}. It won&rsquo;t renew, and you&rsquo;ll move to Free after that.</p>}
            {sub.paymentProblem && (
              <p className="flex items-start gap-2 text-warning">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  Your last payment didn&rsquo;t go through. Razorpay will try again over the next few days; check that your
                  UPI Autopay mandate or card is still active.
                </span>
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Free includes {plan.limits.chatDaily} money-chat questions and {plan.limits.aiDaily} AI entry fills a day.
          </p>
        )}
        {activating && <Activating />}
      </section>

      {plan.id === "free" && !activating && (
        <section aria-labelledby="get-pro" className={card}>
          <h2 id="get-pro" className="font-heading text-xl">
            {billing ? "Get Pro" : "Pro is coming soon"}
          </h2>
          <PlanComparison />
          {billing ? (
            <UpgradePanel />
          ) : (
            <p className="text-sm text-muted-foreground">Payments aren&rsquo;t switched on yet. Everything on Free keeps working.</p>
          )}
        </section>
      )}
      {plan.id === "pro" && (
        <section aria-labelledby="whats-included" className={card}>
          <h2 id="whats-included" className="font-heading text-xl">
            What&rsquo;s included
          </h2>
          <PlanComparison />
        </section>
      )}
    </div>
  );
}
