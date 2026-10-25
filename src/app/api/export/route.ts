import { userCurrency, userToday } from "@/lib/user-prefs";
import { db } from "@/server/db";
import { entriesCsv } from "@/server/services/account";
import { getSession } from "@/server/session";

/** Downloads all of the signed-in user's entries as CSV. */
export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Sign in first.", { status: 401 });
  const csv = await entriesCsv(db, session.user.id, userCurrency(session.user));
  const day = userToday(session.user);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clearpaisa-entries-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
