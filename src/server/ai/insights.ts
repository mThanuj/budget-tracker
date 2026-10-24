import { generateText, Output } from "ai";
import { z } from "zod";
import type { InsightFacts, InsightReport } from "@/lib/insights";
import { BadOutputError } from "./errors";
import type { ModelChoice } from "./providers";

const reportSchema = z.object({
  headline: z.string().describe("One plain sentence on how the period went overall"),
  items: z
    .array(
      z.object({
        kind: z.enum(["good", "watch", "tip"]),
        title: z.string().describe("At most 8 words"),
        detail: z.string().describe("One or two short sentences"),
      }),
    )
    .describe("3 to 6 items"),
});

export function insightInstructions(facts: InsightFacts) {
  const when =
    facts.kind === "so_far" && facts.dayOfMonth
      ? `the current month so far (day ${facts.dayOfMonth.day} of ${facts.dayOfMonth.daysInMonth}); tips are for the rest of this month`
      : "a finished month; tips are for next month";
  return `You write a short money report for someone who is new to managing money.
The facts cover ${when}. Tone: neutral and plain, like a helpful note. No jargon, no exclamation marks, no emojis.

Rules:
- Use only the facts given. Copy every amount and percentage exactly as written there. Never add, subtract, average or work out new numbers.
- headline: one sentence on the overall picture.
- items: 3 to 6, most useful first. "good" is something going well, "watch" is something to keep an eye on, "tip" is one small, practical step.
- Include at least one tip, based on the facts: a category that grew, a budget that ran over, a possible double charge, entries without a category, a subscription price rise, a goal that needs more each month.
- Name categories, entries and goals exactly as in the facts. Don't guess at reasons the facts don't show.
- No investment, loan, tax or product advice.`;
}

// Amounts, percentages and any number of 100 or more must appear in the facts.
const NUMBER = /(\p{Sc})?\s?(\d[\d,]*(?:\.\d+)?)(%?)/gu;

function numbersIn(text: string) {
  return [...text.matchAll(NUMBER)].map((m) => ({
    value: m[2].replace(/,/g, "").replace(/\.0+$/, ""),
    checked: Boolean(m[1] || m[3]) || Number(m[2].replace(/,/g, "")) >= 100,
  }));
}

/** Numbers in the report that the facts don't contain. */
export function ungroundedNumbers(report: InsightReport, facts: InsightFacts) {
  const known = new Set(numbersIn(JSON.stringify(facts)).map((n) => n.value));
  const text = [report.headline, ...report.items.flatMap((i) => [i.title, i.detail])].join("\n");
  return numbersIn(text)
    .filter((n) => n.checked && !known.has(n.value))
    .map((n) => n.value);
}

export async function writeInsightWithModel(m: ModelChoice, facts: InsightFacts): Promise<InsightReport> {
  const { output } = await generateText({
    model: m.model,
    providerOptions: m.providerOptions,
    maxRetries: 0,
    timeout: 30_000,
    instructions: insightInstructions(facts),
    prompt: JSON.stringify(facts),
    output: Output.object({ schema: reportSchema }),
  });
  const report: InsightReport = {
    headline: output.headline.trim().slice(0, 240),
    items: output.items.slice(0, 6).map((i) => ({ kind: i.kind, title: i.title.trim().slice(0, 80), detail: i.detail.trim().slice(0, 320) })),
  };
  const madeUp = ungroundedNumbers(report, facts);
  if (madeUp.length > 0) throw new BadOutputError(`Report used numbers not in the facts: ${madeUp.join(", ")}`);
  if (report.items.length === 0) throw new BadOutputError("Report had no items");
  return report;
}
