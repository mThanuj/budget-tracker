import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/server/db";

/** For Coolify's health check and uptime monitors: is the app up and can it reach the database? */
export async function GET() {
  // Always answered at request time. Without this, `next build` starts the
  // database query while trying to prerender the route (it then gives up).
  await connection();
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[health] database check failed:", err instanceof Error ? err.message : err);
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
