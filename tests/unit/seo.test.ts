// What search engines and link previews get (D-036): the site's address comes
// from BETTER_AUTH_URL at request time, and only public pages are listed.
import { afterEach, describe, expect, it, vi } from "vitest";
import { siteUrl } from "@/config/site";

// Outside a real request Next's connection() throws; here every call is a request.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(async () => undefined),
}));

const { default: robots } = await import("@/app/robots");
const { default: sitemap } = await import("@/app/sitemap");

afterEach(() => vi.unstubAllEnvs());

describe("the site's address (siteUrl)", () => {
  it("is the origin of BETTER_AUTH_URL", () => {
    expect(siteUrl({ BETTER_AUTH_URL: "https://clearpaisa.example" })?.href).toBe("https://clearpaisa.example/");
    expect(siteUrl({ BETTER_AUTH_URL: " https://clearpaisa.example/some/path?x=1 " })?.href).toBe(
      "https://clearpaisa.example/",
    );
    expect(siteUrl({ BETTER_AUTH_URL: "http://localhost:3000" })?.href).toBe("http://localhost:3000/");
  });

  it("is left out, never an error, when the setting is missing or isn't a web address", () => {
    for (const value of [
      undefined,
      "",
      "   ",
      "not a url",
      "clearpaisa.example",
      "javascript:alert(1)",
      "ftp://x.example",
    ]) {
      expect(siteUrl({ BETTER_AUTH_URL: value }), String(value)).toBeUndefined();
    }
  });
});

describe("robots.txt", () => {
  it("lets search engines read the site but not the API, and points at the sitemap", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://clearpaisa.example");
    expect(await robots()).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: "/api/" },
      sitemap: "https://clearpaisa.example/sitemap.xml",
    });
  });

  it("leaves the sitemap out without the site's address", async () => {
    vi.stubEnv("BETTER_AUTH_URL", undefined);
    expect(await robots()).toEqual({ rules: { userAgent: "*", allow: "/", disallow: "/api/" } });
  });
});

describe("sitemap.xml", () => {
  const urls = async () => (await sitemap()).map((entry) => entry.url);

  it("lists the public pages, with the refund policy only while payments are on", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://clearpaisa.example");
    vi.stubEnv("BILLING_ENABLED", "false");
    expect(await urls()).toEqual([
      "https://clearpaisa.example/",
      "https://clearpaisa.example/privacy",
      "https://clearpaisa.example/terms",
      "https://clearpaisa.example/contact",
    ]);
    vi.stubEnv("BILLING_ENABLED", "true");
    expect(await urls()).toContain("https://clearpaisa.example/refund");
  });

  it("is empty without the site's address (a sitemap needs full addresses)", async () => {
    vi.stubEnv("BETTER_AUTH_URL", undefined);
    expect(await urls()).toEqual([]);
  });
});
