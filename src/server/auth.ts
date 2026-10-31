import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { APP_NAME } from "@/config/app";
import { DEFAULT_CURRENCY, DEFAULT_TIME_ZONE } from "@/config/defaults";
import { env } from "@/env";
import { db } from "./db";
import * as schema from "./db/schema";
import { seedNewUser } from "./db/seed-defaults";

export const auth = betterAuth({
  appName: APP_NAME,
  baseURL: env().BETTER_AUTH_URL,
  secret: env().BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  // Better Auth's per-IP limits (on in production; its defaults: 100 requests
  // per 10 s per path, 3 for sign-in), counted in the database so every
  // serverless instance shares them. See implementation-notes.md for the IP header.
  rateLimit: { storage: "database" },
  socialProviders: {
    google: {
      clientId: env().GOOGLE_CLIENT_ID,
      clientSecret: env().GOOGLE_CLIENT_SECRET,
      prompt: "select_account",
    },
  },
  user: {
    // Changed only through our own server actions, never by the client.
    additionalFields: {
      currency: { type: "string", required: false, defaultValue: DEFAULT_CURRENCY, input: false },
      timezone: { type: "string", required: false, defaultValue: DEFAULT_TIME_ZONE, input: false },
      onboardedAt: { type: "date", required: false, input: false },
      aiEnabled: { type: "boolean", required: false, defaultValue: true, input: false },
      defaultWalletId: { type: "string", required: false, input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (newUser) => {
          await seedNewUser(db, newUser.id);
        },
      },
    },
  },
  // Must be last: lets server actions set auth cookies.
  plugins: [nextCookies()],
});

export type CurrentUser = typeof auth.$Infer.Session.user;
