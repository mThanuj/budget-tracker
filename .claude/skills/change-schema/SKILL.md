---
name: change-schema
description: Change the ClearPaisa database schema - add or change a table, column, index or constraint - and ship the migration safely.
---

# Change the database schema

## Read first

- `src/server/db/schema.ts` (the source of truth) and the latest files in `drizzle/`.
- Every service that reads or writes the table: `grep -rn "<tableName>" src/server`.
- `docs/project-memory/business-rules.md` (constraints often encode a rule) and
  the data model in `architecture.md`.

## Steps

1. Edit `schema.ts`. Money is `bigint({ mode: "number" })` in minor units; dates
   `date({ mode: "string" })`; user-owned tables get `userId` referencing
   `user.id` with `onDelete: "cascade"`, and an index starting with `userId`.
2. `pnpm db:generate --name <short_snake_name>` and read the SQL it wrote.
3. Make it **backward compatible**: production applies migrations while the
   previous version is still serving (decision D-004). Add before you remove: a
   new column is nullable or has a default; a rename or drop is a later,
   separate change once nothing uses the old one.
4. Never edit a migration that's already committed (it may have run in production).
5. Update services, validation and types; PGlite tests apply the migrations
   automatically.

## Approval points

- `pnpm db:migrate` applies to the database in `.env.local`. Ask the owner first,
  even for the development database.
- Production gets the migration on the next deploy (`scripts/vercel-build.mjs`),
  which needs the owner's approval to push.

## Done when

- `pnpm db:check` passes (schema and migrations agree).
- `pnpm test:db`, then `pnpm check`.
- Memory: the data model in `architecture.md`, `business-rules.md` if a rule
  changed, a line in `changelog.md`.
