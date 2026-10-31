"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isValidTimeZone } from "@/lib/dates";
import { isValidCurrency } from "@/lib/money";
import { normalizeTimeZone } from "@/lib/preferences-options";
import { TOO_FAST, withinActionLimit } from "@/server/action-utils";
import { db } from "@/server/db";
import { user as userTable } from "@/server/db/schema";
import { seedNewUser } from "@/server/db/seed-defaults";
import { UserError } from "@/server/services/errors";
import { updatePreferences } from "@/server/services/settings";
import { requireUser } from "@/server/session";

export type PreferencesState = { ok: true } | { error: string } | undefined;

const preferencesSchema = z.object({
  currency: z.string().refine(isValidCurrency),
  timezone: z.string().transform(normalizeTimeZone).refine(isValidTimeZone),
});

function parsePreferences(formData: FormData) {
  return preferencesSchema.safeParse({
    currency: formData.get("currency"),
    timezone: formData.get("timezone"),
  });
}

const INVALID = { error: "Choose a currency and a time zone from the lists." };

/** A refusal the person should read (a UserError) becomes the form's message; anything else is a real error. */
async function refusalOf(save: () => Promise<void>): Promise<{ error: string } | undefined> {
  try {
    await save();
    return undefined;
  } catch (err) {
    if (err instanceof UserError) return { error: err.message };
    throw err;
  }
}

export async function savePreferences(_prev: PreferencesState, formData: FormData): Promise<PreferencesState> {
  const user = await requireUser();
  if (!(await withinActionLimit(user.id))) return { error: TOO_FAST };
  const parsed = parsePreferences(formData);
  if (!parsed.success) return INVALID;

  const refused = await refusalOf(() => updatePreferences(db, user.id, parsed.data));
  if (refused) return refused;
  refresh();
  return { ok: true };
}

export async function completeWelcome(_prev: PreferencesState, formData: FormData): Promise<PreferencesState> {
  const user = await requireUser();
  if (!(await withinActionLimit(user.id))) return { error: TOO_FAST };
  const parsed = parsePreferences(formData);
  if (!parsed.success) return INVALID;

  const refused = await refusalOf(() => updatePreferences(db, user.id, parsed.data, { onboarding: true }));
  if (refused) return refused;
  // Safety net in case the signup hook failed: seeding is idempotent.
  await seedNewUser(db, user.id);
  // Next: a few questions to set up wallets, bills and a starter budget (skippable).
  redirect("/setup");
}

export async function setAiEnabled(enabled: boolean): Promise<PreferencesState> {
  const user = await requireUser();
  if (!(await withinActionLimit(user.id))) return { error: TOO_FAST };
  await db
    .update(userTable)
    .set({ aiEnabled: enabled === true })
    .where(eq(userTable.id, user.id));
  refresh();
  return { ok: true };
}
