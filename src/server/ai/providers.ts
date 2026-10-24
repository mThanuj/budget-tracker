import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { generateText, LanguageModel } from "ai";
import type { ProviderConfig } from "./config";

type ProviderOptions = NonNullable<Parameters<typeof generateText>[0]["providerOptions"]>;

export type ProviderModels = {
  name: string;
  chat: LanguageModel;
  fast: LanguageModel;
  providerOptions: ProviderOptions;
};

function merge(base: Record<string, unknown>, extra: Record<string, unknown>): Record<string, unknown> {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    const current = out[k];
    out[k] =
      v && typeof v === "object" && !Array.isArray(v) && current && typeof current === "object" && !Array.isArray(current)
        ? merge(current as Record<string, unknown>, v as Record<string, unknown>)
        : v;
  }
  return out;
}

/** One model on one provider: what a task actually runs on. */
export type ModelChoice = { provider: string; modelId: string; model: LanguageModel; providerOptions: ProviderOptions };

/**
 * The models to try on a provider, in order. Small tasks prefer the fast model
 * and fall back to the bigger one; free tiers limit each model separately, so
 * this doubles what one provider can handle before moving on.
 */
export function lanesFor(p: ProviderConfig, prefer: "fast" | "chat"): ModelChoice[] {
  const m = modelsFor(p);
  const fast = { provider: p.name, modelId: p.fastModel, model: m.fast, providerOptions: m.providerOptions };
  const chat = { provider: p.name, modelId: p.model, model: m.chat, providerOptions: m.providerOptions };
  if (p.fastModel === p.model) return [chat];
  return prefer === "fast" ? [fast, chat] : [chat];
}

/**
 * After a tool call the SDK echoes the model's earlier reasoning back as
 * `reasoning_content` on assistant messages; Groq rejects that field (400),
 * and no provider needs it to continue, so it's always removed.
 */
export function withoutEchoedReasoning(body: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(body.messages)) return body;
  return {
    ...body,
    messages: body.messages.map((m: unknown) =>
      m && typeof m === "object" && "reasoning_content" in m
        ? Object.fromEntries(Object.entries(m).filter(([key]) => key !== "reasoning_content"))
        : m,
    ),
  };
}

const cache = new Map<string, ProviderModels>();

export function modelsFor(p: ProviderConfig): ProviderModels {
  const key = JSON.stringify(p);
  const hit = cache.get(key);
  if (hit) return hit;
  const provider = createOpenAICompatible({
    name: p.name,
    baseURL: p.baseURL,
    apiKey: p.apiKey,
    supportsStructuredOutputs: p.structured,
    transformRequestBody: (args: Record<string, unknown>) => {
      const body = withoutEchoedReasoning(args);
      return p.body ? merge(body, p.body) : body;
    },
  });
  const models: ProviderModels = {
    name: p.name,
    chat: provider.chatModel(p.model),
    fast: provider.chatModel(p.fastModel),
    providerOptions: {
      [p.name]: { ...p.options, ...(p.structured && { strictJsonSchema: true }) } as ProviderOptions[string],
    },
  };
  cache.set(key, models);
  return models;
}
