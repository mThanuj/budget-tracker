// Request floods: a signed-in script calling server actions as fast as it can.
// Every action counts against the user's per-minute limit (D-026) unless it's
// on the reviewed exempt list below, so a new action fails here until someone
// decides. Over the limit, an action must stop before doing anything and return
// its usual failure: a thrown error would reach error monitoring, and a flood of
// calls would become a flood of reports.
import { readdirSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/server/db/schema";

const session = vi.hoisted(() => ({ user: null as null | typeof import("@/server/db/schema").user.$inferSelect }));

vi.mock("@/server/db", async () => {
  const { createTestDb } = await import("../db/helpers");
  return { db: (await createTestDb()).db };
});
vi.mock("@/server/session", async () => {
  const { redirect } = await import("next/navigation");
  return {
    requireUser: vi.fn(async () => session.user ?? redirect("/?signed-out=1")),
    getSession: vi.fn(async () => (session.user ? { user: session.user } : null)),
  };
});
vi.mock("next/cache", () => ({ refresh: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({ getAll: () => [], delete: vi.fn() })),
}));
vi.mock("@/server/auth", () => ({ auth: { api: { signOut: vi.fn(async () => undefined) } } }));
// Every call is already over the limit.
vi.mock("@/server/services/limits", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/limits")>()),
  countActionCall: vi.fn(async () => Number.MAX_SAFE_INTEGER),
}));

const { db } = await import("@/server/db");
const { createTestUser } = await import("../db/helpers");
const { seedNewUser } = await import("@/server/db/seed-defaults");
const { countActionCall } = await import("@/server/services/limits");

/** Actions that don't count against the limit, and why. */
const EXEMPT: Record<string, string> = {
  "account.ts › signOut": "must always work",
  "account.ts › deleteAccount": "must always work (and needs the word DELETE)",
  "admin.ts › sendTestError": "admins only",
  "entry-form.ts › getEntryFormData": "only reads the user's own lists, like a page load (pages aren't limited)",
};

// What a blocked action returns: the form message, the AI's "busy", or "nothing" for background checks.
const BLOCKED = /Too many requests\. Wait a minute and try again\.|"reason":"busy"|^false$|^null$/;

beforeAll(async () => {
  const row = await createTestUser(db, { name: "Script", onboardedAt: new Date() });
  await seedNewUser(db, row.id);
  session.user = row;
});
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("every server action is rate limited, or reviewed as exempt", () => {
  it("and over the limit, stops before doing anything and returns its usual failure", async () => {
    const dir = new URL("../../src/server/actions/", import.meta.url);
    const tables = [schema.wallet, schema.category, schema.transaction, schema.goal, schema.recurringRule];
    const rows = () => Promise.all(tables.map((t) => db.$count(t)));
    const before = await rows();
    const found: string[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      const exports = (await import(/* @vite-ignore */ new URL(file, dir).pathname)) as Record<string, unknown>;
      for (const [name, fn] of Object.entries(exports)) {
        if (typeof fn !== "function") continue;
        const key = `${file} › ${name}`;
        found.push(key);
        vi.mocked(countActionCall).mockClear();
        const outcome = await Reflect.apply(fn, null, [undefined, new FormData()]).then(
          (value: unknown) => ({ value }),
          (err: unknown) => ({ err }),
        );
        if (key in EXEMPT) {
          expect(countActionCall, key).not.toHaveBeenCalled();
          continue;
        }
        expect(countActionCall, key).toHaveBeenCalledOnce();
        expect(outcome, key).not.toHaveProperty("err");
        expect(JSON.stringify("value" in outcome ? outcome.value : undefined), key).toMatch(BLOCKED);
      }
    }
    expect(found).toEqual(expect.arrayContaining(Object.keys(EXEMPT))); // no stale entries
    expect(await rows()).toEqual(before);
  }, 30_000); // loads and calls every action; over 5 s when the whole suite runs in parallel
});
