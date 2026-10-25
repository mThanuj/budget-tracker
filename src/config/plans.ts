// What each plan includes. Prices are shown in INR because payments go through
// Razorpay; each user's own tracking currency is unrelated.

export type PlanId = "free" | "pro";

export const PLANS = {
  free: {
    name: "Free",
    chatDaily: 10,
    aiDaily: 50, // entry filling + category suggestions + setup answers
    insights: false,
    insightRefreshesPerMonth: 0,
  },
  pro: {
    name: "Pro",
    chatDaily: 100,
    aiDaily: 200,
    insights: true,
    insightRefreshesPerMonth: 5,
  },
} as const satisfies Record<PlanId, unknown>;

export type BillingInterval = "monthly" | "yearly";

// Must match the plans created in the Razorpay dashboard.
export const PRICES: Record<BillingInterval, { amountMinor: number; amount: string; per: string; note?: string }> = {
  monthly: { amountMinor: 79_00, amount: "₹79", per: "a month" },
  yearly: { amountMinor: 799_00, amount: "₹799", per: "a year", note: "About 2 months free" },
};

export const priceLabel = (interval: BillingInterval) => `${PRICES[interval].amount} ${PRICES[interval].per}`;
