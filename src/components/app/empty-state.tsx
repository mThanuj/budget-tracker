import type { ReactNode } from "react";
import { cn } from "cn";

/** The one look for "nothing here yet": dashed box, short title, a sentence, an optional next step. */
export function EmptyState({
  title,
  children,
  action,
  headingLevel = 2,
  className,
}: {
  title?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  /** Match the page outline: 3 when the empty state sits under a section heading. */
  headingLevel?: 2 | 3;
  className?: string;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <div className={cn("rounded-2xl border border-dashed border-border px-6 py-12 text-center", className)}>
      {title && <Heading className="font-heading text-xl text-balance">{title}</Heading>}
      <div className={cn("mx-auto max-w-sm text-muted-foreground text-pretty", title && "mt-2")}>{children}</div>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}
