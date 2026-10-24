import { type ReactNode, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { LEGAL_UPDATED } from "@/config/legal";

/** A policy page: static title, with the body (which reads the operator's details) streamed in. */
export function LegalPage({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <article className="legal mx-auto max-w-2xl py-10 sm:py-14">
      <h1 className="font-heading text-4xl tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated {LEGAL_UPDATED}</p>
      {intro && <p className="mt-6 text-lg text-muted-foreground">{intro}</p>}
      <Suspense
        fallback={
          <div className="mt-10 grid gap-3">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-11/12" />
            <Skeleton className="h-5 w-4/5" />
          </div>
        }
      >
        {children}
      </Suspense>
    </article>
  );
}

/** The operator's name, or a neutral stand-in while it isn't set yet. */
export const operatorName = (operator: string | null) => operator ?? "the ClearPaisa team";

export function EmailLink({ email }: { email: string | null }) {
  return email ? <a href={`mailto:${email}`}>{email}</a> : <>the email on our Contact page</>;
}
