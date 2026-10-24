import type { RuleRow } from "@/server/services/recurring";
import type { RuleItem } from "./recurring-manager";

/** Server row → the plain object the recurring UI works with. */
export function toRuleItem(r: RuleRow): RuleItem {
  return {
    id: r.rule.id,
    type: r.rule.type,
    amountMinor: r.rule.amountMinor,
    description: r.rule.description,
    categoryId: r.rule.categoryId,
    walletId: r.rule.walletId,
    toWalletId: r.rule.toWalletId,
    frequency: r.rule.frequency,
    interval: r.rule.interval,
    anchorDate: r.rule.anchorDate,
    endDate: r.rule.endDate,
    mode: r.rule.mode,
    isSubscription: r.rule.isSubscription,
    active: r.rule.active,
    nextDueOn: r.rule.nextDueOn,
    walletName: r.walletName,
    toWalletName: r.toWalletName,
    categoryName: r.categoryName,
    categoryIcon: r.categoryIcon,
    categoryColor: r.categoryColor,
    latestAmountMinor: r.latestAmountMinor ?? null,
    previousAmountMinor: r.previousAmountMinor ?? null,
  };
}
