import "server-only";
import { z } from "zod";
import { fieldErrors } from "@/lib/validation";
import { UserError } from "./services/errors";

export type ActionResult =
  { ok: true } | { ok: false; error?: string; fieldErrors?: Record<string, string> } | undefined;

/** Turns validation and expected service errors into a result the form can show. */
export async function runAction(fn: () => Promise<void>): Promise<ActionResult> {
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
