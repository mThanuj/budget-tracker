import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { formatMonth, monthNeighbors } from "@/lib/date-format";
import type { ISOMonth } from "@/lib/dates";

const arrow =
  "grid size-8 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50";

/** ‹ October 2026 › with a "This month" shortcut; `href` builds each month's URL. */
export function MonthSwitcher({
  month,
  currentMonth,
  href,
}: {
  month: ISOMonth;
  currentMonth: ISOMonth;
  href: (month: ISOMonth) => string;
}) {
  const { prev, next } = monthNeighbors(month);
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-1">
        <Link href={href(prev)} aria-label={`Previous month, ${formatMonth(prev)}`} className={arrow}>
          <ChevronLeftIcon className="size-5" />
        </Link>
        <h2 className="min-w-36 text-center font-heading text-xl">{formatMonth(month)}</h2>
        <Link href={href(next)} aria-label={`Next month, ${formatMonth(next)}`} className={arrow}>
          <ChevronRightIcon className="size-5" />
        </Link>
      </div>
      {month !== currentMonth && (
        <Link href={href(currentMonth)} className="link text-sm">
          This month
        </Link>
      )}
    </div>
  );
}
