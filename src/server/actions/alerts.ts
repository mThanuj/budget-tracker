"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { type ActionResult, runAction } from "@/server/action-utils";
import { db } from "@/server/db";
import { dismissAlert as dismiss } from "@/server/services/alerts";
import { requireUser } from "@/server/session";

const alertKey = z.string().regex(/^(budget|goal|bill|price):[0-9a-f-]{36}:[\w:-]{1,40}$/);

export async function dismissAlert(key: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    await dismiss(db, user.id, alertKey.parse(key));
    refresh();
  });
}
