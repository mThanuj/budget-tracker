"use server";

import { sentryDsn } from "@/lib/monitoring";
import { requireAdmin } from "@/server/admin";
import { log } from "@/server/log";
import { currentRequestId } from "@/server/request-id";

/**
 * Sends one test error to error monitoring, to check the whole path: the event
 * reaches Sentry, an alert fires and its email arrives (docs/OBSERVABILITY.md).
 * Admins only; nothing about the admin is in the event.
 */
export async function sendTestError(): Promise<{ sent: boolean }> {
  await requireAdmin();
  log.error("monitoring.test_error", {
    err: new Error("Test error from the admin page (safe to ignore)"),
    requestId: await currentRequestId(),
  });
  return { sent: Boolean(sentryDsn()) };
}
