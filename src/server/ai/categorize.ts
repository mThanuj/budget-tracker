import { generateText, Output } from "ai";
import type { ModelChoice } from "./providers";

export type CategoryOption = { id: string; name: string };

/** Asks a model to pick one of the user's categories for a description. */
export async function chooseCategoryWithModel(
  m: ModelChoice,
  input: { description: string; type: "income" | "expense"; categories: CategoryOption[] },
): Promise<string | null> {
  if (input.categories.length === 0) return null;
  const { output } = await generateText({
    model: m.model,
    providerOptions: m.providerOptions,
    maxRetries: 0,
    timeout: 10_000,
    instructions: [
      `You sort ${input.type === "income" ? "money received" : "spending"} into categories for a personal budgeting app used in India.`,
      "Pick the single best category for the description. Prefer a specific category over a general one.",
      "Ready-to-eat food and drinks (chai, coffee, snacks, meals, Swiggy, Zomato) are Dining Out; ingredients and household items are Groceries.",
      'If nothing fits, pick the "Other" option if there is one.',
    ].join("\n"),
    prompt: `Description: ${input.description.slice(0, 200)}`,
    output: Output.choice({ options: input.categories.map((c) => c.name) }),
  });
  return input.categories.find((c) => c.name === output)?.id ?? null;
}
