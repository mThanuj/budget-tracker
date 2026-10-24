import { todayInTz } from "@/lib/dates";
import { db } from "@/server/db";
import { entriesCsv } from "@/server/services/account";
import { getSession } from "@/server/session";

/** Downloads all of the signed-in user's entries as CSV. */
export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Sign in first.", { status: 401 });
  const { id, currency, timezone } = session.user;
  const csv = await entriesCsv(db, id, currency ?? "INR");
  const day = todayInTz(timezone ?? "Asia/Kolkata");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clearpaisa-entries-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
