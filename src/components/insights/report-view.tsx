import { CircleCheckIcon, EyeIcon, LightbulbIcon } from "lucide-react";
import { cn } from "cn";
import type { InsightItem, InsightReport } from "@/lib/insights";

// Each kind reads by icon + words, never color alone.
const KIND: Record<InsightItem["kind"], { Icon: typeof CircleCheckIcon; label: string; tone: string }> = {
  good: { Icon: CircleCheckIcon, label: "Going well", tone: "text-primary" },
  watch: { Icon: EyeIcon, label: "Keep an eye on", tone: "text-warning" },
  tip: { Icon: LightbulbIcon, label: "Try this", tone: "text-foreground" },
};

export function ReportView({ report, footnote }: { report: InsightReport; footnote?: string }) {
  return (
    <div className="grid gap-4">
      <p className="font-heading text-lg leading-snug">{report.headline}</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {report.items.map((item, i) => {
          const { Icon, label, tone } = KIND[item.kind];
          return (
            <li key={i} className="grid content-start gap-1.5 rounded-xl bg-muted/50 p-4">
              <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", tone)}>
                <Icon className="size-3.5" aria-hidden />
                {label}
              </span>
              <p className="font-medium">{item.title}</p>
              <p className="text-sm text-muted-foreground">{item.detail}</p>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        {footnote ? `${footnote} ` : ""}Written by AI from the numbers below. Not financial advice.
      </p>
    </div>
  );
}
