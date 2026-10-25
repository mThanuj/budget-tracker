import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// env() validates lazily and caches, so each test loads a fresh copy.
const REQUIRED = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "secret",
};
const saved = { ...process.env };
const load = async () => (await import("@/env")).env;

describe("environment configuration", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.assign(process.env, REQUIRED);
  });
  afterEach(() => {
    process.env = { ...saved };
    vi.restoreAllMocks();
  });

  it("fails loudly when a required setting is missing", async () => {
    delete process.env.BETTER_AUTH_SECRET;
    const env = await load();
    expect(() => env()).toThrow(/Invalid environment variables/);
  });

  it("keeps a good cron secret", async () => {
    process.env.CRON_SECRET = "c".repeat(32);
    expect((await load())().CRON_SECRET).toBe("c".repeat(32));
  });

  it("turns off only the cron job when its secret is too short, and says so", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.CRON_SECRET = "zq9-tooshort";
    const env = await load();
    expect(() => env()).not.toThrow(); // sign-in and every page keep working
    expect(env().CRON_SECRET).toBeUndefined();
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("CRON_SECRET is shorter than 24 characters"));
    expect(String(logged.mock.calls[0][0])).not.toContain("zq9-tooshort"); // never prints the value
  });
});
