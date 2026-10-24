import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it } from "vitest";
import { chooseCategoryWithModel } from "@/server/ai/categorize";
import { globalAiLimit, type ProviderConfig, providerChain } from "@/server/ai/config";
import { classifyError } from "@/server/ai/errors";
import { resetCooldowns, runWithFallback } from "@/server/ai/fallback";
import { type EntryContext, entryInstructions, entrySchema, extractEntryWithModel, type RawEntry, toPrefill } from "@/server/ai/parse-entry";
import { z } from "zod";
import type { ModelChoice } from "@/server/ai/providers";

function mockReturning(text: string) {
  const model = new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: undefined },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 10, text: 10, reasoning: undefined },
      },
      warnings: [],
    }),
  });
  const models: ModelChoice = { provider: "mock", modelId: "mock", model, providerOptions: {} };
  return { model, models };
}

const ctx: EntryContext = {
  today: "2026-10-24",
  timeZone: "Asia/Kolkata",
  currency: "INR",
  wallets: [
    { id: "w-cash", name: "Cash" },
    { id: "w-sbi", name: "SBI Debit" },
    { id: "w-card", name: "ICICI Credit Card" },
  ],
  defaultWalletId: "w-cash",
  categories: [
    { id: "c-dining", name: "Dining Out", kind: "expense" },
    { id: "c-groceries", name: "Groceries", kind: "expense" },
    { id: "c-salary", name: "Salary", kind: "income" },
  ],
};

const raw = (over: Partial<RawEntry> = {}): RawEntry => ({
  type: "expense",
  amount: 240,
  description: "Chai and samosa",
  date: "2026-10-23",
  wallet: "Cash",
  toWallet: null,
  category: "Dining Out",
  ...over,
});

describe("providerChain", () => {
  const env = {
    LLM_CHAIN_FREE: "groq, cerebras ,openrouter",
    LLM_GROQ_BASE_URL: "https://api.groq.com/openai/v1",
    LLM_GROQ_API_KEY: "gsk_test",
    LLM_GROQ_MODEL: "openai/gpt-oss-120b",
    LLM_GROQ_MODEL_FAST: "openai/gpt-oss-20b",
    LLM_GROQ_STRUCTURED: "true",
    LLM_GROQ_OPTIONS: '{"reasoningEffort":"low"}',
    LLM_CEREBRAS_BASE_URL: "https://api.cerebras.ai/v1",
    LLM_CEREBRAS_MODEL: "gpt-oss-120b",
    LLM_OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
    LLM_OPENROUTER_API_KEY: "sk-or-test",
    LLM_OPENROUTER_MODEL: "nvidia/nemotron-3-super-120b-a12b:free",
    LLM_OPENROUTER_BODY: '{"provider":{"data_collection":"deny"}}',
  };

  it("keeps the order and skips providers without a key", () => {
    const chain = providerChain(env);
    expect(chain.map((p) => p.name)).toEqual(["groq", "openrouter"]);
    expect(chain[0]).toMatchObject({ fastModel: "openai/gpt-oss-20b", structured: true, options: { reasoningEffort: "low" } });
    expect(chain[1]).toMatchObject({ fastModel: "nvidia/nemotron-3-super-120b-a12b:free", body: { provider: { data_collection: "deny" } } });
  });

  it("explains malformed JSON settings", () => {
    expect(() => providerChain({ ...env, LLM_GROQ_OPTIONS: "{oops" })).toThrow(/LLM_GROQ_OPTIONS must be a JSON object/);
  });

  it("reads the global limit with a safe default", () => {
    expect(globalAiLimit({})).toBe(1500);
    expect(globalAiLimit({ AI_GLOBAL_DAILY_LIMIT: "nope" })).toBe(1500);
    expect(globalAiLimit({ AI_GLOBAL_DAILY_LIMIT: "200" })).toBe(200);
  });
});

describe("runWithFallback", () => {
  const p = (name: string): ProviderConfig => ({
    name,
    baseURL: "https://example.invalid/v1",
    apiKey: "k",
    model: "m",
    fastModel: "m",
    structured: true,
    options: {},
    body: null,
  });
  const rateLimited = () =>
    new APICallError({ message: "slow down", url: "x", requestBodyValues: {}, statusCode: 429, responseHeaders: { "retry-after": "30" } });

  beforeEach(() => resetCooldowns());

  it("moves on when a provider is rate limited, then skips it while it cools down", async () => {
    const calls: string[] = [];
    const outcomes: string[] = [];
    const task = async (m: ModelChoice) => {
      calls.push(m.provider);
      if (m.provider === "first") throw rateLimited();
      return "done";
    };
    const record = async (provider: string, outcome: string) => void outcomes.push(`${provider}:${outcome}`);

    expect(await runWithFallback([p("first"), p("second")], task, record, () => 1_000)).toEqual({ ok: true, value: "done", provider: "second" });
    expect(outcomes).toEqual(["first:rate_limited", "second:ok"]);

    await runWithFallback([p("first"), p("second")], task, record, () => 20_000); // still cooling down (30s)
    expect(calls).toEqual(["first", "second", "second"]);
    await runWithFallback([p("first"), p("second")], task, record, () => 40_000);
    expect(calls.at(-2)).toBe("first");
  });

  it("reports busy when everything is down, unreadable when answers were bad", async () => {
    expect(await runWithFallback([p("a")], async () => Promise.reject(new TypeError("fetch failed")))).toEqual({ ok: false, reason: "busy" });
    resetCooldowns();
    const bad = new APICallError({ message: "schema", url: "x", requestBodyValues: {}, statusCode: 400 });
    expect(await runWithFallback([p("a")], async () => Promise.reject(bad))).toEqual({ ok: false, reason: "unreadable" });
    expect(await runWithFallback([], async () => "x")).toEqual({ ok: false, reason: "busy" });
  });

  it("tries a provider's second model before moving to the next provider", async () => {
    const two: ProviderConfig = { ...p("groq"), model: "big", fastModel: "small" };
    const tried: string[] = [];
    const result = await runWithFallback([two, p("cerebras")], async (m) => {
      tried.push(`${m.provider}/${m.modelId}`);
      if (m.modelId === "small") throw rateLimited();
      return "ok";
    });
    expect(tried).toEqual(["groq/small", "groq/big"]);
    expect(result).toMatchObject({ ok: true, provider: "groq" });
  });

  it("classifies errors", () => {
    expect(classifyError(rateLimited())).toEqual({ kind: "rate_limited", cooldownMs: 30_000 });
    expect(classifyError(new APICallError({ message: "", url: "", requestBodyValues: {}, statusCode: 401 })).kind).toBe("auth");
    expect(classifyError(new APICallError({ message: "", url: "", requestBodyValues: {}, statusCode: 503 })).kind).toBe("unavailable");
    expect(classifyError(new DOMException("timed out", "TimeoutError")).kind).toBe("unavailable");
  });
});

describe("entry parsing", () => {
  it("sends today's date, wallets and categories, and parses the answer", async () => {
    const { model, models } = mockReturning(JSON.stringify(raw()));
    const result = await extractEntryWithModel(models, ctx, "spent 240 on chai yesterday, paid cash");
    expect(result).toMatchObject({ amount: 240, wallet: "Cash", category: "Dining Out" });

    const call = model.doGenerateCalls[0];
    const prompt = JSON.stringify(call.prompt);
    expect(prompt).toContain("Today is Saturday, 2026-10-24");
    expect(prompt).toContain("spent 240 on chai yesterday");
    // Wallet and category names travel once, as allowed values in the schema.
    expect(call.responseFormat).toMatchObject({ type: "json" });
    expect(JSON.stringify(call.responseFormat)).toContain("ICICI Credit Card");
    expect(prompt).not.toContain("ICICI Credit Card");
  });

  it("never sends a one-value list (Groq's validator rejects those)", () => {
    const oneWallet = { ...ctx, wallets: [{ id: "w-cash", name: "Cash" }] };
    const props = z.toJSONSchema(entrySchema(oneWallet)).properties as Record<string, unknown>;
    expect(JSON.stringify(props.wallet)).not.toContain("enum");
    expect(JSON.stringify(z.toJSONSchema(entrySchema(ctx)).properties)).toContain('"enum":["Cash","SBI Debit","ICICI Credit Card"]');
  });

  it("explains Indian shorthand and common mix-ups, briefly", () => {
    const text = entryInstructions(ctx);
    expect(text).toContain("1L = 1 lakh = 100000");
    expect(text).toContain("ATM withdrawal = bank to Cash");
    expect(text).toContain("Income categories are: Salary.");
    expect(text.length).toBeLessThan(1400); // free tiers limit tokens per minute
  });

  it("maps names to the user's own wallets and categories", () => {
    expect(toPrefill(ctx, raw())).toEqual({
      type: "expense",
      amountMinor: 24000,
      description: "Chai and samosa",
      occurredOn: "2026-10-23",
      walletId: "w-cash",
      toWalletId: null,
      categoryId: "c-dining",
    });
    expect(toPrefill(ctx, raw({ type: "income", amount: 42000, wallet: "sbi debit", category: "Salary" }))).toMatchObject({
      walletId: "w-sbi",
      categoryId: "c-salary",
      amountMinor: 4_200_000,
    });
    expect(toPrefill(ctx, raw({ type: "transfer", wallet: "SBI Debit", toWallet: "Cash", category: "Dining Out" }))).toMatchObject({
      walletId: "w-sbi",
      toWalletId: "w-cash",
      categoryId: null,
    });
  });

  it("never trusts the model blindly", () => {
    // Wrong-kind category, unknown wallet, far-future date.
    expect(toPrefill(ctx, raw({ type: "income", category: "Dining Out", wallet: "Paytm", date: "2030-01-01" }))).toMatchObject({
      categoryId: null,
      walletId: "w-cash",
      occurredOn: "2026-10-24",
    });
    expect(toPrefill(ctx, raw({ date: "yesterday" }))?.occurredOn).toBe("2026-10-24");
    expect(toPrefill(ctx, raw({ type: "transfer", wallet: "Cash", toWallet: "Cash" }))?.toWalletId).toBeNull();
    expect(toPrefill(ctx, raw({ amount: 0 }))).toBeNull();
    expect(toPrefill(ctx, raw({ amount: -50 }))).toBeNull();
    expect(toPrefill(ctx, raw({ amount: 5e12 }))).toBeNull();
    expect(toPrefill(ctx, raw({ amount: 99.999 }))?.amountMinor).toBe(10000);
  });
});

describe("category choice", () => {
  it("returns the id of the category the model picked", async () => {
    const { models } = mockReturning('{"result":"Groceries"}');
    const id = await chooseCategoryWithModel(models, {
      description: "Big Bazaar",
      type: "expense",
      categories: ctx.categories.filter((c) => c.kind === "expense"),
    });
    expect(id).toBe("c-groceries");
  });

  it("rejects a category that isn't one of the options", async () => {
    const { models } = mockReturning('{"result":"Pets"}');
    await expect(
      chooseCategoryWithModel(models, { description: "Dog food", type: "expense", categories: ctx.categories }),
    ).rejects.toThrow();
  });
});
