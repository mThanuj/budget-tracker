import "server-only";
import { z } from "zod";
import { LIMITS } from "@/config/limits";
import { fieldErrors } from "@/lib/validation";
import { db } from "./db";
import { log } from "./log";
import { currentRequestId } from "./request-id";
import { UserError } from "./services/errors";
import { countActionCall } from "./services/limits";

export type ActionResult =
  { ok: true } | { ok: false; error?: string; fieldErrors?: Record<string, string> } | undefined;

export const TOO_FAST = "Too many requests. Wait a minute and try again.";

/**
 * Counts this call against the user's per-minute action limit
 * (src/config/limits.ts); false once they're over it. Over the limit an action
 * returns its usual failure instead of throwing, so a flood of calls doesn't
 * become a flood of error reports; one warning is logged per minute.
 */
export async function withinActionLimit(userId: string): Promise<boolean> {
  const calls = await countActionCall(db, userId);
  if (calls === LIMITS.actionsPerMinute + 1) {
    log.warn("ratelimit.actions_blocked", { limit: LIMITS.actionsPerMinute, requestId: await currentRequestId() });
  }
  return calls <= LIMITS.actionsPerMinute;
}

/**
 * Checks the user's action limit, then turns validation and expected service
 * errors into a result the form can show.
 */
export async function runAction(userId: string, fn: () => Promise<void>): Promise<ActionResult> {
  if (!(await withinActionLimit(userId))) return { ok: false, error: TOO_FAST };
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    if (err instanceof z.ZodError) return { ok: false, fieldErrors: fieldErrors(err) };
    if (err instanceof UserError) {
      return err.field ? { ok: false, fieldErrors: { [err.field]: err.message } } : { ok: false, error: err.message };
    }
    throw err; // redirects from requireUser() and real bugs
  }
}

export const idSchema = z.uuid();

/** FormData → plain object of strings (files ignored). */
export function formObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData) if (typeof v === "string") out[k] = v;
  return out;
}
