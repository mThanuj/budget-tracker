import { Brand } from "@/components/app/brand";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { PlanComparison } from "@/components/billing/plan-comparison";
import { LegalLinks } from "@/components/legal/legal-links";
import { billingEnabled } from "@/config/features";
import { PRICES } from "@/config/plans";
import { Suspense } from "react";
import { DeletedNotice } from "./_components/deleted-notice";
import { PassbookDemo } from "./_components/passbook-demo";

const FEATURES = [
  {
    title: "Write it like a message",
    body: "“paid 450 for dinner with my ICICI card” becomes a sorted entry in the right wallet. You check it, then save.",
  },
  {
    title: "Budgets that speak up early",
    body: "See what's left in each category. You get a heads-up at 80%, not a surprise at the end of the month.",
  },
  {
    title: "Ask about your money",
    body: "“How much did I spend on food in October?” Answers come from your own entries, not guesses.",
  },
];

export default function LandingPage() {
  const billing = billingEnabled();
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-5 sm:px-8">
      <header className="flex h-16 items-center justify-between">
        <Brand />
        <GoogleSignInButton label="Sign in" variant="ghost" size="default" />
      </header>
      <Suspense>
        <DeletedNotice />
      </Suspense>

      <main className="flex-1">
        <section className="grid items-center gap-12 py-12 md:py-20 lg:grid-cols-[1fr_minmax(0,32rem)] lg:gap-16">
          <div className="max-w-xl">
            <h1 className="font-heading text-[2.6rem] leading-[1.05] tracking-tight text-balance sm:text-6xl">
              Know where your money goes.
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-pretty text-muted-foreground">
              Type what you spent the way you&apos;d text a friend. The app sorts it, adds it up and answers your
              questions, so you can stick to a budget without a spreadsheet.
            </p>
            <div className="mt-9 flex flex-col items-start gap-3">
              <GoogleSignInButton className="h-11 px-5 text-base" />
              <p className="text-sm text-muted-foreground">
                {billing ? "Free to start. No card needed." : "Free to use. No card needed."}
              </p>
            </div>
          </div>

          <PassbookDemo />
        </section>

        <section
          aria-label="What you can do"
          className="grid gap-x-10 gap-y-8 border-t border-border py-14 md:grid-cols-3"
        >
          {FEATURES.map((f) => (
            <div key={f.title}>
              <h2 className="font-heading text-xl">{f.title}</h2>
              <p className="mt-2 leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </section>

        {billing && (
          <section
            aria-labelledby="pricing"
            className="grid gap-8 border-t border-border py-14 lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-16"
          >
            <div>
              <h2 id="pricing" className="font-heading text-3xl tracking-tight">
                Free to use. Pro if you want more AI help.
              </h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                Everything for tracking your money is free. Pro is {PRICES.monthly.amount} {PRICES.monthly.per} or{" "}
                {PRICES.yearly.amount} {PRICES.yearly.per}, paid through Razorpay. Cancel any time.
              </p>
            </div>
            <div className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10 sm:p-6">
              <PlanComparison />
            </div>
          </section>
        )}
      </main>

      <footer className="grid gap-4 border-t border-border py-6 text-sm text-muted-foreground sm:flex sm:items-center sm:justify-between">
        <div className="grid gap-1">
          <Brand className="text-base" />
          <p>Your entries are private to your account.</p>
        </div>
        <LegalLinks />
      </footer>
    </div>
  );
}
