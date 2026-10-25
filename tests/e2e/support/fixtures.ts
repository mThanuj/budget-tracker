import { test as base, type Page } from "@playwright/test";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { testUtils } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../../src/server/db/schema";
import { seedNewUser } from "../../../src/server/db/seed-defaults";

process.loadEnvFile(".env.local");

// Same timeouts as the app: a dropped connection fails the test with a clear
// error instead of hanging silently until the test timeout.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 4,
  connectionTimeoutMillis: 10_000,
  query_timeout: 20_000,
  keepAlive: true,
});
export const db = drizzle({ client: pool, schema, casing: "snake_case" });

// A test-only auth instance with the same database and secret as the app, so
// the session cookies it signs are accepted by the dev server.
const testAuth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  plugins: [testUtils()],
});

type Fixtures = {
  /**
   * Whether the test user starts with AI features on. Off by default, so tests
   * never reach the AI provider by accident (the entry form asks it for a
   * category as soon as a description is typed). Tests about AI opt in with
   * `test.use({ ai: true })`; the ones that really call the provider are also
   * tagged @live-ai and only run with LIVE_AI=1.
   */
  ai: boolean;
  /** Signs a fresh, already-onboarded user into the page. Deleted afterwards. */
  signedIn: { page: Page; userId: string };
  /** Same, but the user hasn't finished the welcome step yet. */
  newUser: { page: Page; userId: string };
};

async function signIn(page: Page, { onboarded, ai }: { onboarded: boolean; ai: boolean }) {
  const ctx = await testAuth.$context;
  const id = crypto.randomUUID();
  const user = await ctx.test.saveUser(
    ctx.test.createUser({ id, email: `e2e-${id}@example.test`, name: "Asha Rao", emailVerified: true }),
  );
  await seedNewUser(db, user.id);
  await db
    .update(schema.user)
    .set({ aiEnabled: ai, onboardedAt: onboarded ? new Date() : null })
    .where(eq(schema.user.id, user.id));
  const cookies = await ctx.test.getCookies({ userId: user.id, domain: "localhost" });
  await page.context().addCookies(cookies);
  return user.id;
}

async function cleanup(userId: string) {
  await db.delete(schema.user).where(eq(schema.user.id, userId));
}

// The fixture callback is named `provide` (not `use`) so the React hooks lint rule leaves it alone.
export const test = base.extend<Fixtures>({
  // Next's dev-only badge sits bottom-right, which on a phone is on top of the
  // entry sheet's Save button once any console error is counted as an "issue".
  // Production has no badge or overlay, so tests (and tour screenshots) hide them.
  page: async ({ page }, provide) => {
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = "nextjs-portal { display: none !important; }";
        document.head.append(style);
      });
    });
    await provide(page);
  },
  ai: [false, { option: true }],
  signedIn: async ({ page, ai }, provide) => {
    const userId = await signIn(page, { onboarded: true, ai });
    await provide({ page, userId });
    await cleanup(userId);
  },
  newUser: async ({ page, ai }, provide) => {
    const userId = await signIn(page, { onboarded: false, ai });
    await provide({ page, userId });
    await cleanup(userId);
  },
});

export { expect } from "@playwright/test";
