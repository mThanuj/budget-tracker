import Link from "next/link";
import { CategoryIcon } from "@/components/categories/category-icon";
import { formatMoney } from "@/lib/money";

export type CategorySpend = {
  categoryId: string | null;
  name: string | null;
  icon: string | null;
  color: string | null;
  spentMinor: number;
};

const SHOWN = 5;

/**
 * Where the money went: one hue for every bar (the categories are nominal, so
 * color would only repeat what bar length says). Icons and names carry identity.
 */
export function CategoryBars({ rows, currency, month }: { rows: CategorySpend[]; currency: string; month: string }) {
  const total = rows.reduce((s, r) => s + r.spentMinor, 0);
  if (total === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No spending recorded this month yet.</p>;
  }
  const top = rows.slice(0, SHOWN);
  const rest = rows.slice(SHOWN);
  const items = [
    ...top.map((r) => ({
      key: r.categoryId ?? "none",
      name: r.name ?? "No category",
      icon: r.icon ?? "tag",
      color: r.color,
      spentMinor: r.spentMinor,
      href: `/transactions?month=${month}&type=expense&category=${r.categoryId ?? "none"}`,
    })),
    ...(rest.length > 0
      ? [
          {
            key: "rest",
            name: `Everything else (${rest.length})`,
            icon: "circle-ellipsis",
            color: null,
            spentMinor: rest.reduce((s, r) => s + r.spentMinor, 0),
            href: `/transactions?month=${month}&type=expense`,
          },
        ]
      : []),
  ];
  const max = Math.max(...items.map((i) => i.spentMinor));

  return (
    <ul className="grid gap-1">
      {items.map((i) => {
        const share = Math.round((i.spentMinor / total) * 100);
        return (
          <li key={i.key}>
            <Link
              href={i.href}
              aria-label={`${i.name}: ${formatMoney(i.spentMinor, currency)}, ${share}% of spending`}
              className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 rounded-lg px-2 py-1.5 outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 sm:grid-cols-[minmax(0,11rem)_1fr_auto]"
            >
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <CategoryIcon icon={i.icon} color={i.color} size="sm" />
                <span className="truncate">{i.name}</span>
              </span>
              <span aria-hidden className="h-2 overflow-hidden">
                <span
                  className="block h-full rounded-r-[4px] bg-chart-1"
                  style={{ width: `${Math.max((i.spentMinor / max) * 100, 2)}%` }}
                />
              </span>
              <span className="tabular w-28 text-right text-sm sm:w-32">
                {formatMoney(i.spentMinor, currency)}
                <span className="ml-1.5 text-xs text-muted-foreground">{share}%</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
