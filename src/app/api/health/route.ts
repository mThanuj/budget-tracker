import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/server/db";
import { log } from "@/server/log";

// The database gets this long to answer before the check reports it down
// (the pool's own connect timeout is 10 s, too slow for a health check).
const DB_TIMEOUT_MS = 3_000;

/**
 * Readiness, for the container's health check and uptime monitors: can the app
 * reach the database? A trivial query, and the reply says only ok or not. For
 * "is the app running" without touching the database, use /api/health/live.
 */
export async function GET() {
  // Always answered at request time. Without this, `next build` starts the
  // database query while trying to prerender the route (it then gives up).
  await connection();
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`no answer within ${DB_TIMEOUT_MS} ms`)), DB_TIMEOUT_MS);
      }),
    ]);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    log.error("health.db_unreachable", { err, ms: Date.now() - started });
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  } finally {
    clearTimeout(timer);
  }
}
