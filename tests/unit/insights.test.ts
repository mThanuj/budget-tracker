import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import type { InsightFacts } from "@/lib/insights";
import { BadOutputError, classifyError } from "@/server/ai/errors";
import { ungroundedNumbers, writeInsightWithModel } from "@/server/ai/insights";
import type { ModelChoice } from "@/server/ai/providers";

const facts: InsightFacts = {
  kind: "month",
  period: "September 2026",
  dayOfMonth: null,
  entries: 7,
  income: "₹40,000",
  spending: "₹23,699",
  kept: { amount: "₹16,301", shareOfIncome: "41%" },
  spentMoreThanIncomeBy: null,
  noIncomeRecorded: false,
  comparedWith: { period: "August 2026", spending: "₹5,649", change: "320% more" },
  averageMonthlySpendingBefore: null,
  categories: [{ name: "Groceries", spent: "₹5,000", shareOfSpending: "21%", before: "₹4,000", change: "25% more" }],
  overallLimit: null,
  budgetsOver: [],
  budgetsNearLimit: [],
  biggestExpenses: [],
  possibleDuplicates: [{ what: "Swiggy", amount: "₹450", dates: ["10 Sep", "11 Sep"] }],
  trackedSubscriptions: null,
  priceChanges: [],
  goals: [],
  entriesWithoutCategory: 0,
};

const model = (text: string): ModelChoice => ({
  provider: "mock",
  modelId: "mock",
  providerOptions: {},
  model: new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: undefined },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 10, text: 10, reasoning: undefined },
      },
      warnings: [],
    }),
  }),
});

const item = (detail: string) => ({ kind: "tip", title: "Check Swiggy", detail });

describe("insight write-ups", () => {
  it("accepts numbers copied from the facts, small counts and dates", () => {
    const report = {
      headline: "You kept ₹16,301, which is 41% of your income.",
      items: [item("Swiggy charged ₹450 on 10 Sep and 11 Sep. Groceries were 25% more.")] as never,
    };
    expect(ungroundedNumbers(report, facts)).toEqual([]);
  });

  it("catches amounts and percentages the model worked out itself", () => {
    const report = {
      headline: "Groceries and Swiggy came to ₹5,900 together.",
      items: [item("That's 12% of your spending.")] as never,
    };
    expect(ungroundedNumbers(report, facts)).toEqual(["5900", "12"]);
  });

  it("returns a tidy report, at most 6 items", async () => {
    const items = Array.from({ length: 8 }, () => ({
      kind: "good",
      title: "  Rent is steady ",
      detail: "Nothing new.",
    }));
    const report = await writeInsightWithModel(model(JSON.stringify({ headline: "A busy month.", items })), facts);
    expect(report.items).toHaveLength(6);
    expect(report.items[0].title).toBe("Rent is steady");
  });

  it("rejects made-up numbers so the next model gets a turn", async () => {
    const text = JSON.stringify({ headline: "You spent ₹99,999.", items: [item("Fine.")] });
    const err = await writeInsightWithModel(model(text), facts).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadOutputError);
    expect(classifyError(err)).toEqual({ kind: "bad_output", cooldownMs: 0 });
  });
});
