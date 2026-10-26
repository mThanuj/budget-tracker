import { connection } from "next/server";

// Liveness: the app is running and answering. It touches no database or other
// service, so it can be pinged every few minutes without waking the database,
// and never fails because a dependency is down. Readiness (can it reach the
// database?) is /api/health.
const ok = () => Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });

export async function GET() {
  await connection(); // answered by the running app, never a copy made at build time
  return ok();
}

export async function HEAD() {
  await connection();
  return new Response(null, { headers: { "Cache-Control": "no-store" } });
}
