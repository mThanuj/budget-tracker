import "server-only";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/** Any Drizzle Postgres database using our schema (node-postgres in the app, PGlite in tests). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const globalForDb = globalThis as unknown as { pgPool?: Pool };

// A dead connection (dropped Wi-Fi, a proxy reset) otherwise makes a query
// wait forever without an error. These fail it fast instead, and the pool
// replaces the broken client. Client-side only: a server-side
// statement_timeout is a startup parameter that connection poolers can reject.
const POOL_TIMEOUTS = {
  connectionTimeoutMillis: 10_000,
  query_timeout: 20_000,
  keepAlive: true,
} as const;

// Reuse one pool across dev hot reloads. `pg` connects lazily on first query.
// On Vercel each function instance gets its own small pool that lets idle
// connections go quickly (Neon's pooled URL absorbs the many instances).
const pool =
  globalForDb.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ...POOL_TIMEOUTS,
    ...(process.env.VERCEL ? { max: 3, idleTimeoutMillis: 5_000 } : { max: 10 }),
  });
if (process.env.NODE_ENV !== "production") globalForDb.pgPool = pool;

export const db = drizzle({ client: pool, schema, casing: "snake_case" });
