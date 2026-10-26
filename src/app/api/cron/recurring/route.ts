import { timingSafeEqual } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { MONITORING } from "@/config/monitoring";
import { env } from "@/env";
import { db } from "@/server/db";
import { log } from "@/server/log";
import { requestIdFrom } from "@/server/request-id";
import { recordDueForEveryone } from "@/server/services/recurring";

function authorized(header: string | null, secret: string) {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** The scheduled job (daily on Vercel, hourly on an own server): records automatic recurring entries that came due for every user. */
export async function GET(request: Request) {
  const secret = env().CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), secret)) {
    log.warn("cron.unauthorized", { requestId: requestIdFrom(request.headers) });
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  // The check-in tells Sentry the job ran (and how it went), so a missed or failed
  // day raises an alert; without Sentry configured it just runs the job.
  const job = MONITORING.recurringJob;
  const result = await Sentry.withMonitor(job.slug, () => recordDueForEveryone(db), {
    schedule: { type: "crontab", value: process.env.VERCEL ? job.schedule.vercel : job.schedule.ownServer },
    checkinMargin: job.checkinMarginMinutes,
    maxRuntime: job.maxRuntimeMinutes,
    timezone: "Etc/UTC",
  }); // a failure still reaches onRequestError (src/instrumentation.ts)
  await Sentry.flush(2_000); // deliver the check-in before the function can be frozen
  log.info("cron.recurring_done", { ...result, ms: Date.now() - started, requestId: requestIdFrom(request.headers) });
  return Response.json(result);
}
