import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";

/**
 * A calm, full-width message for pages that can't show their content (not
 * found, failed to load). One layout so every dead end looks the same and
 * always offers a way back.
 */
export function StatusView({
  eyebrow,
  title,
  children,
  actions,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mx-auto grid max-w-md justify-items-start gap-3 py-16 sm:py-24">
      <p className="text-sm font-medium text-muted-foreground">{eyebrow}</p>
      <h1 className="font-heading text-3xl tracking-tight text-balance">{title}</h1>
      <div className="text-muted-foreground text-pretty">{children}</div>
      <div className="mt-3 flex flex-wrap gap-3">
        {actions ?? (
          <Link href="/" className={cn(buttonVariants({ size: "lg" }))}>
            Go to Home
          </Link>
        )}
      </div>
    </div>
  );
}

export function NotFoundView() {
  return (
    <StatusView eyebrow="Page not found" title="We couldn't find that page">
      The link may be old, or the page may have moved.
    </StatusView>
  );
}
