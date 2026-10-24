"use server";

import { eq, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isValidTimeZone } from "@/lib/dates";
import { isValidCurrency } from "@/lib/money";
import { normalizeTimeZone } from "@/lib/preferences-options";
import { db } from "@/server/db";
import { user as userTable } from "@/server/db/schema";
import { seedNewUser } from "@/server/db/seed-defaults";
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

export async function savePreferences(
  _prev: PreferencesState,
  formData: FormData,
): Promise<PreferencesState> {
  const user = await requireUser();
  const parsed = parsePreferences(formData);
  if (!parsed.success) return INVALID;

  await db.update(userTable).set(parsed.data).where(eq(userTable.id, user.id));
  refresh();
  return { ok: true };
}

export async function completeWelcome(
  _prev: PreferencesState,
  formData: FormData,
): Promise<PreferencesState> {
  const user = await requireUser();
  const parsed = parsePreferences(formData);
  if (!parsed.success) return INVALID;

  await db
    .update(userTable)
    .set({ ...parsed.data, onboardedAt: sql`coalesce(${userTable.onboardedAt}, now())` })
    .where(eq(userTable.id, user.id));
  // Safety net in case the signup hook failed: seeding is idempotent.
  await seedNewUser(db, user.id);
  redirect("/dashboard");
}

export async function setAiEnabled(enabled: boolean): Promise<PreferencesState> {
  const user = await requireUser();
  await db.update(userTable).set({ aiEnabled: enabled === true }).where(eq(userTable.id, user.id));
  refresh();
  return { ok: true };
}
