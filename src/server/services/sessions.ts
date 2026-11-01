import { and, desc, eq, gt, sql } from "drizzle-orm";
import type { Db } from "../db";
import { session } from "../db/schema";

/**
 * Where the user is signed in: their live sessions, newest first. Never the
 * token (it is the sign-in itself) or the IP address.
 */
export async function listSignedInDevices(db: Db, userId: string) {
  return db
    .select({ id: session.id, userAgent: session.userAgent, createdAt: session.createdAt })
    .from(session)
    .where(and(eq(session.userId, userId), gt(session.expiresAt, sql`now()`)))
    .orderBy(desc(session.createdAt))
    .limit(50);
}
