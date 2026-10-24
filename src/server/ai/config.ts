// AI providers come entirely from env vars, so switching provider or model
// never needs a code change. Each provider in a chain is defined by:
//   LLM_<NAME>_BASE_URL, LLM_<NAME>_API_KEY, LLM_<NAME>_MODEL
//   LLM_<NAME>_MODEL_FAST    (optional; cheaper model for small tasks)
//   LLM_<NAME>_STRUCTURED    ("true" if it supports strict JSON schema output)
//   LLM_<NAME>_OPTIONS       (optional JSON; provider options, e.g. reasoningEffort)
//   LLM_<NAME>_BODY          (optional JSON merged into every request body)
// Providers without a key are skipped, so a partly configured chain still works.

export type ProviderConfig = {
  name: string;
  baseURL: string;
  apiKey: string;
  model: string;
  fastModel: string;
  structured: boolean;
  options: Record<string, unknown>;
  body: Record<string, unknown> | null;
};

type Env = Record<string, string | undefined>;

function json(env: Env, key: string): Record<string, unknown> | null {
  const raw = env[key]?.trim();
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {}
  throw new Error(`${key} must be a JSON object, like {"reasoningEffort":"low"}.`);
}

export function providerChain(env: Env = process.env, chainVar = "LLM_CHAIN_FREE"): ProviderConfig[] {
  const names = (env[chainVar] ?? "")
    .split(",")
    .map((n) => n.trim().toLowerCase())
    .filter((n) => /^[a-z][a-z0-9_]{0,20}$/.test(n));
  return names.flatMap((name) => {
    const prefix = `LLM_${name.toUpperCase()}_`;
    const apiKey = env[`${prefix}API_KEY`]?.trim();
    const baseURL = env[`${prefix}BASE_URL`]?.trim();
    const model = env[`${prefix}MODEL`]?.trim();
    if (!apiKey || !baseURL || !model) return [];
    return [
      {
        name,
        baseURL,
        apiKey,
        model,
        fastModel: env[`${prefix}MODEL_FAST`]?.trim() || model,
        structured: env[`${prefix}STRUCTURED`] === "true",
        options: json(env, `${prefix}OPTIONS`) ?? {},
        body: json(env, `${prefix}BODY`),
      },
    ];
  });
}

export function aiLimits(env: Env = process.env) {
  const num = (key: string, fallback: number) => {
    const n = Number(env[key]);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return {
    // Entry parsing + category suggestions per user per day.
    userDaily: num("AI_USER_DAILY_LIMIT", 50),
    // Everyone together, to stay inside the free providers' daily quotas.
    globalDaily: num("AI_GLOBAL_DAILY_LIMIT", 1500),
  };
}
