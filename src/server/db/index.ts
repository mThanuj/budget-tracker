import "server-only";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { log } from "../log";
import * as schema from "./schema";

/** Any Drizzle Postgres database using our schema (node-postgres in the app, PGlite in tests). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

declare global {
  // Survives dev hot reloads, so each reload doesn't open a new pool.
  var pgPool: Pool | undefined;
}

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
// On Vercel each function instance gets its own pool (Neon's pooled URL
// absorbs the many instances). 10 connections let a page's queries run at
// once instead of in waves of 3; keeping idle ones a minute saves the next
// page a new connection (TCP, TLS and sign-in) before its first query.
const pool =
  globalThis.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ...POOL_TIMEOUTS,
    ...(process.env.VERCEL ? { max: 10, idleTimeoutMillis: 60_000 } : { max: 10 }),
  });
if (!globalThis.pgPool) {
  // An idle connection the server closes emits "error" on the pool, which
  // would crash the process without a listener. The pool drops that client
  // and opens a new one for the next query, so a warning is enough.
  pool.on("error", (err) => log.warn("db.idle_connection_error", { err: err.message }));
}
if (process.env.NODE_ENV !== "production") globalThis.pgPool = pool;

export const db = drizzle({ client: pool, schema, casing: "snake_case" });
