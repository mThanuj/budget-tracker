// Settings are listed in several places: .env.example (documentation),
// src/env.ts (validation) and tests/stubs/clean-env.ts (what tests remove so no
// test can use a real key). These checks keep the lists from drifting apart.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APP_SETTINGS } from "../stubs/clean-env";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const documented = [...read(".env.example").matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1]);
// Settings tests may see: they change nothing a test depends on and hold no secret.
const HARMLESS = new Set(["NEXT_TELEMETRY_DISABLED", "LOG_LEVEL"]);

describe("settings", () => {
  it("every setting in .env.example is removed before tests run, or is harmless", () => {
    expect(documented.length).toBeGreaterThan(30);
    expect(documented.filter((name) => !APP_SETTINGS.test(name) && !HARMLESS.has(name))).toEqual([]);
  });

  it("every setting src/env.ts validates is documented in .env.example", () => {
    const schema = read("src/env.ts").match(/const schema = z\.object\(\{([\s\S]*?)\n\}\);/)?.[1] ?? "";
    const validated = [...schema.matchAll(/^ {2}([A-Z0-9_]+):/gm)].map((m) => m[1]);
    expect(validated.length).toBeGreaterThan(4);
    expect(validated.filter((name) => !documented.includes(name))).toEqual([]);
  });
});
