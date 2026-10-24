// Runs once when a server instance starts, before it serves requests.
export async function register() {
  // Only in the production image (RUN_MIGRATIONS=1 in the Dockerfile); in
  // development, run `pnpm db:migrate` yourself.
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.RUN_MIGRATIONS !== "1") return;
  const { runMigrations } = await import("./server/db/migrate");
  await runMigrations();
}
