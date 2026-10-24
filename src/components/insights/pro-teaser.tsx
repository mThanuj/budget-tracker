import { SparklesIcon } from "lucide-react";
import Link from "next/link";
import { PRICES } from "@/config/plans";

/** Shown on Insights to Free users, only when Pro can actually be bought. */
export function ProTeaser({ period }: { period: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-muted/50 p-4">
      <SparklesIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="font-medium">Get {period} written up in plain words</p>
        <p className="text-sm text-muted-foreground">
          Pro turns these numbers into a short report: what went well, what to watch and a few small things to try. From{" "}
          {PRICES.monthly.amount} {PRICES.monthly.per}.
        </p>
        <Link
          href="/billing"
          className="justify-self-start rounded text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          See Pro
        </Link>
      </div>
    </div>
  );
}
