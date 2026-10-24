import { CheckIcon, MinusIcon } from "lucide-react";
import { PLANS } from "@/config/plans";

const yes = (
  <>
    <CheckIcon className="inline size-4 text-primary" aria-hidden />
    <span className="sr-only">Included</span>
  </>
);
const no = (
  <>
    <MinusIcon className="inline size-4 text-muted-foreground" aria-hidden />
    <span className="sr-only">Not included</span>
  </>
);

const ROWS = [
  { feature: "Money chat questions", free: `${PLANS.free.chatDaily} a day`, pro: `${PLANS.pro.chatDaily} a day` },
  { feature: "AI entry filling", free: `${PLANS.free.aiDaily} a day`, pro: `${PLANS.pro.aiDaily} a day` },
  { feature: "Monthly report with tips", free: no, pro: yes },
  { feature: "“This month so far” check-ins", free: no, pro: `${PLANS.pro.insightRefreshesPerMonth} a month` },
  { feature: "Wallets, budgets, goals and more", free: yes, pro: yes },
];

export function PlanComparison() {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">What Free and Pro include</caption>
      <thead>
        <tr className="border-b border-border text-left text-muted-foreground">
          <th scope="col" className="py-2 pr-4 font-normal">
            Feature
          </th>
          <th scope="col" className="w-20 py-2 pr-3 font-medium text-foreground sm:w-36">
            Free
          </th>
          <th scope="col" className="w-20 py-2 font-medium text-foreground sm:w-36">
            Pro
          </th>
        </tr>
      </thead>
      <tbody>
        {ROWS.map((r) => (
          <tr key={r.feature} className="border-b border-border/60 last:border-0">
            <th scope="row" className="py-3 pr-4 text-left font-normal">
              {r.feature}
            </th>
            <td className="py-3 pr-3 text-muted-foreground">{r.free}</td>
            <td className="py-3">{r.pro}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
