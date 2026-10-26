import { timingSafeEqual } from "node:crypto";
import { env } from "@/env";
import { db } from "@/server/db";
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
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json(await recordDueForEveryone(db));
}
