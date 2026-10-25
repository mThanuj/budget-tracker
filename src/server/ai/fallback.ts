import type { ProviderConfig } from "./config";
import { classifyError, type ProviderFailure } from "./errors";
import { lanesFor, type ModelChoice } from "./providers";

export type AiOutcome = "ok" | ProviderFailure;

// Providers that recently rate-limited or failed are skipped until this time.
// In memory per server process, which is enough for a single app server.
const coolingDown = new Map<string, number>();

export function resetCooldowns() {
  coolingDown.clear();
}

/**
 * Usage counters feed the admin page. Failing to write one is logged, and never
 * changes the answer, marks a working provider as down, or skips a fallback.
 */
async function note(
  record: ((provider: string, outcome: AiOutcome) => Promise<void>) | undefined,
  provider: string,
  outcome: AiOutcome,
) {
  if (!record) return;
  try {
    await record(provider, outcome);
  } catch (err) {
    console.error(
      `[ai] couldn't record a ${outcome} result for ${provider}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Runs `task` on the first provider/model that works. Any failure moves on to
 * the next model, then the next provider; the user only sees an error when
 * everything failed.
 */
export async function runWithFallback<T>(
  chain: ProviderConfig[],
  task: (m: ModelChoice) => Promise<T>,
  record?: (provider: string, outcome: AiOutcome) => Promise<void>,
  now: () => number = Date.now,
  prefer: "fast" | "chat" = "fast",
): Promise<{ ok: true; value: T; provider: string } | { ok: false; reason: "busy" | "unreadable" }> {
  let sawBadOutput = false;
  for (const p of chain) {
    for (const lane of lanesFor(p, prefer)) {
      const key = `${lane.provider}/${lane.modelId}`;
      if ((coolingDown.get(key) ?? 0) > now()) continue;
      let value: T;
      try {
        value = await task(lane);
      } catch (err) {
        const { kind, cooldownMs } = classifyError(err);
        if (cooldownMs > 0) coolingDown.set(key, now() + cooldownMs);
        if (kind === "bad_output") sawBadOutput = true;
        console.warn(`[ai] ${key} failed (${kind}):`, err instanceof Error ? err.message : err);
        await note(record, p.name, kind);
        // A bad key won't work for the provider's other model either.
        if (kind === "auth") break;
        continue;
      }
      // Recorded only after the answer is safely in hand.
      await note(record, p.name, "ok");
      return { ok: true, value, provider: p.name };
    }
  }
  return { ok: false, reason: sawBadOutput ? "unreadable" : "busy" };
}
