import { APICallError, NoObjectGeneratedError, NoOutputGeneratedError, TypeValidationError } from "ai";

/** Output that parsed fine but failed our own checks (e.g. made-up numbers). */
export class BadOutputError extends Error {}

export type ProviderFailure = "rate_limited" | "unavailable" | "bad_output" | "auth";

/** Why a provider call failed, and how long to leave that provider alone. */
export function classifyError(err: unknown): { kind: ProviderFailure; cooldownMs: number } {
  if (APICallError.isInstance(err)) {
    const status = err.statusCode ?? 0;
    if (status === 429) {
      const retryAfter = Number(err.responseHeaders?.["retry-after"]);
      return {
        kind: "rate_limited",
        cooldownMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 60_000,
      };
    }
    if (status === 401 || status === 403) return { kind: "auth", cooldownMs: 10 * 60_000 };
    // 400/404/422: the request or schema was rejected (e.g. no compliant provider).
    if (status >= 400 && status < 500) return { kind: "bad_output", cooldownMs: 0 };
    return { kind: "unavailable", cooldownMs: 30_000 };
  }
  if (err instanceof BadOutputError) return { kind: "bad_output", cooldownMs: 0 };
  if (
    NoObjectGeneratedError.isInstance(err) ||
    NoOutputGeneratedError.isInstance(err) ||
    TypeValidationError.isInstance(err)
  ) {
    return { kind: "bad_output", cooldownMs: 0 };
  }
  // Timeouts, aborted or failed connections.
  return { kind: "unavailable", cooldownMs: 30_000 };
}
