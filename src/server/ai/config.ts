// AI providers come entirely from env vars, so switching provider or model
// never needs a code change. Each provider in a chain is defined by:
//   LLM_<NAME>_BASE_URL, LLM_<NAME>_API_KEY, LLM_<NAME>_MODEL
//   LLM_<NAME>_MODEL_FAST    (optional; cheaper model for small tasks)
//   LLM_<NAME>_STRUCTURED    ("true" if it supports strict JSON schema output)
//   LLM_<NAME>_OPTIONS       (optional JSON; provider options, e.g. reasoningEffort)
//   LLM_<NAME>_BODY          (optional JSON merged into every request body)
// Providers without a key are skipped, so a partly configured chain still works.
//
// No "server-only" import here on purpose: the eval scripts (scripts/ai-*.ts)
// run this in plain Node, where it throws. Keys can't reach the browser anyway
// (Next only inlines NEXT_PUBLIC_ variables), and `pnpm check:bundle` verifies it.

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

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The parsed value, or undefined if the text isn't valid JSON. Anything unexpected is re-thrown. */
function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (err) {
    if (err instanceof SyntaxError) return undefined;
    throw err;
  }
}

/** An optional JSON-object setting: null when unset, "invalid" when it isn't a JSON object. */
function json(env: Env, key: string): Record<string, unknown> | null | "invalid" {
  const raw = env[key]?.trim();
  if (!raw) return null;
  const value = parseJson(raw);
  return isRecord(value) ? value : "invalid";
}

// Each misconfigured setting is reported once per server process, not on every request.
const reported = new Set<string>();
function reportOnce(message: string) {
  if (reported.has(message)) return;
  reported.add(message);
  console.error(message);
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
    // A malformed optional setting disables this provider only, rather than
    // crashing every page that checks whether AI is available.
    const options = json(env, `${prefix}OPTIONS`);
    const body = json(env, `${prefix}BODY`);
    if (options === "invalid" || body === "invalid") {
      const bad = options === "invalid" ? `${prefix}OPTIONS` : `${prefix}BODY`;
      reportOnce(
        `[ai] ${bad} must be a JSON object, like {"reasoningEffort":"low"}; the "${name}" provider is skipped until it's fixed.`,
      );
      return [];
    }
    return [
      {
        name,
        baseURL,
        apiKey,
        model,
        fastModel: env[`${prefix}MODEL_FAST`]?.trim() || model,
        structured: env[`${prefix}STRUCTURED`] === "true",
        options: options ?? {},
        body,
      },
    ];
  });
}

/** Requests per day for everyone together on the free chain, to stay inside the free providers' quotas. */
export function globalAiLimit(env: Env = process.env) {
  const n = Number(env.AI_GLOBAL_DAILY_LIMIT);
  return Number.isFinite(n) && n >= 0 && env.AI_GLOBAL_DAILY_LIMIT?.trim() ? n : 1500;
}
