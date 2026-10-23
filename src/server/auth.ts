import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { APP_NAME } from "@/config/app";
import { env } from "@/env";
import { db } from "./db";
import * as schema from "./db/schema";
import { seedDefaultCategories } from "./db/seed-defaults";

export const auth = betterAuth({
  appName: APP_NAME,
  baseURL: env().BETTER_AUTH_URL,
  secret: env().BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
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
      currency: { type: "string", required: false, defaultValue: "INR", input: false },
      timezone: { type: "string", required: false, defaultValue: "Asia/Kolkata", input: false },
      onboardedAt: { type: "date", required: false, input: false },
      aiEnabled: { type: "boolean", required: false, defaultValue: true, input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (newUser) => {
          await seedDefaultCategories(db, newUser.id);
        },
      },
    },
  },
  // Must be last: lets server actions set auth cookies.
  plugins: [nextCookies()],
});

export type CurrentUser = typeof auth.$Infer.Session.user;
