import { createHash } from "node:crypto";
import { unstable_doesMiddlewareMatch, unstable_getResponseFromNextConfig } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { themeInitScript } from "@/components/theme/theme-script";
import {
  contentSecurityPolicy,
  headerRules,
  monitoringOrigin,
  newNonce,
  ROUTE_HANDLER_CSP,
  securityHeaders,
  STATIC_FILE_CSP,
  THEME_SCRIPT_HASH,
} from "@/lib/security-headers";
import { config as proxyConfig, proxy } from "@/proxy";

const NONCE = "bm9uY2UtZm9yLXRlc3Rz";
const map = (dev: boolean) => Object.fromEntries(securityHeaders({ dev }).map((h) => [h.key, h.value]));
const directives = (policy: string) =>
  Object.fromEntries(
    policy.split("; ").map((d) => {
      const [k, ...v] = d.split(" ");
      return [k, v.join(" ")];
    }),
  );
const page = (dev: boolean) => directives(contentSecurityPolicy({ dev, nonce: NONCE }));

describe("the page CSP (D-027)", () => {
  it("locks down the dangerous script and framing surfaces", () => {
    const d = page(false);
    expect(d["object-src"]).toBe("'none'");
    expect(d["base-uri"]).toBe("'self'"); // blocks <base> hijacking
    expect(d["frame-ancestors"]).toBe("'none'"); // clickjacking
    expect(d["form-action"]).toBe("'self'"); // no cross-site form exfil
    expect(d["default-src"]).toBe("'self'");
    // A script runs only with this response's nonce, as the theme snippet, or
    // added by one that does; 'self' and Razorpay are for older browsers.
    expect(d["script-src"]).toBe(
      `'self' 'nonce-${NONCE}' 'strict-dynamic' ${THEME_SCRIPT_HASH} https://checkout.razorpay.com`,
    );
    expect(d["script-src"]).not.toContain("'unsafe-inline'");
    expect(d["script-src"]).not.toContain("'unsafe-eval'"); // never in production
  });

  it("allows the theme snippet by its exact hash", () => {
    expect(THEME_SCRIPT_HASH).toBe(`'sha256-${createHash("sha256").update(themeInitScript).digest("base64")}'`);
  });

  it("uses a new nonce each time, in the form Next reads from the header", () => {
    const nonces = new Set(Array.from({ length: 50 }, newNonce));
    expect(nonces.size).toBe(50);
    // Next's own pattern (next/dist/server/app-render/get-script-nonce-from-header.js).
    for (const n of nonces) expect(`'nonce-${n}'`).toMatch(/^'nonce-([A-Za-z0-9+/_-]+={0,2})'$/);
  });

  it("allows eval only in development (React Fast Refresh needs it)", () => {
    expect(page(true)["script-src"]).toContain("'unsafe-eval'");
    expect(page(false)["script-src"]).not.toContain("'unsafe-eval'");
  });

  it("allows exactly the external origins the app needs", () => {
    const d = page(false);
    expect(d["img-src"]).toContain("https://*.googleusercontent.com"); // Google avatars
    expect(d["connect-src"]).toContain("https://api.razorpay.com");
    expect(d["frame-src"]).toContain("https://checkout.razorpay.com");
    expect(d["style-src"]).toBe("'self' 'unsafe-inline'"); // toasts inject <style>; components use style={}
  });

  it("is HTTPS-strict in production, dev-friendly otherwise", () => {
    expect(contentSecurityPolicy({ dev: false, nonce: NONCE })).toContain("upgrade-insecure-requests");
    expect(contentSecurityPolicy({ dev: false, nonce: NONCE })).not.toContain("ws:");
    expect(contentSecurityPolicy({ dev: true, nonce: NONCE })).not.toContain("upgrade-insecure-requests");
    expect(contentSecurityPolicy({ dev: true, nonce: NONCE })).toContain("ws:"); // Turbopack hot reload
  });
});

describe("the proxy", () => {
  const csp = (res: Response) => res.headers.get("content-security-policy") ?? "";
  const withoutNonce = (policy: string) => policy.replace(/'nonce-[^']+'/, "'nonce-…'");

  it("gives every page request its own nonce, for Next (request) and the browser (response)", () => {
    const first = proxy(new NextRequest("http://localhost:3000/privacy"));
    const second = proxy(new NextRequest("http://localhost:3000/privacy"));
    expect(csp(first)).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/]+={0,2}' 'strict-dynamic'/);
    expect(first.headers.get("x-middleware-request-content-security-policy")).toBe(csp(first));
    expect(csp(second)).not.toBe(csp(first));
    expect(withoutNonce(csp(second))).toBe(withoutNonce(csp(first)));
  });

  it("does it on Vercel too", () => {
    const res = proxy(new NextRequest("http://localhost:3000/privacy", { headers: { "x-vercel-id": "sin1::abc" } }));
    expect(csp(res)).toContain("'strict-dynamic'");
    expect(res.headers.get("x-middleware-request-content-security-policy")).toBe(csp(res));
  });
});

describe("exactly one CSP per path (D-029)", () => {
  // Pages get theirs from the proxy (with a nonce); what the proxy never sees gets
  // a fixed one from next.config's rules; two would both apply and break pages.
  const fromProxy = (path: string) => unstable_doesMiddlewareMatch({ config: proxyConfig, url: path });
  const fromConfig = async (path: string) =>
    (
      await unstable_getResponseFromNextConfig({
        url: `http://localhost:3000${path}`,
        nextConfig: { headers: async () => headerRules({ dev: false }) },
      })
    ).headers.get("content-security-policy");

  it.each([
    ["/", "proxy"],
    ["/privacy", "proxy"],
    ["/dashboard", "proxy"],
    ["/no-such-page", "proxy"],
    ["/apifoo", "proxy"], // not under /api: a page address
    ["/x.php", "static"], // the 404 page for an address with a dot
    ["/a/b.html", "static"],
    ["/api.php", "static"],
    ["/favicon.ico", "static"],
    ["/manifest.webmanifest", "static"],
    ["/.well-known/security.txt", "static"],
    ["/api", "route"],
    ["/api/health", "route"],
    ["/api/auth/callback/google", "route"],
    ["/api/export.csv", "route"],
    ["/_next/static/chunks/main.js", "none"], // the app's own bundles, served as they are
    ["/_next/image", "none"],
  ] as const)("%s → %s", async (path, source) => {
    const expected = { proxy: null, static: STATIC_FILE_CSP, route: ROUTE_HANDLER_CSP, none: null }[source];
    expect(fromProxy(path), "the proxy runs").toBe(source === "proxy");
    expect(await fromConfig(path), "next.config's CSP").toBe(expected);
  });

  it("lets no script run on what the proxy doesn't see, except the theme snippet", () => {
    const scripts = /script-src ([^;]*)/.exec(STATIC_FILE_CSP)?.[1];
    expect(scripts).toBe(THEME_SCRIPT_HASH);
    expect(STATIC_FILE_CSP).toContain("default-src 'none'");
    expect(STATIC_FILE_CSP).toContain("frame-ancestors 'none'");
  });
});

describe("the other headers", () => {
  it("are HTTPS-strict in production, dev-friendly otherwise", () => {
    expect(map(false)["Strict-Transport-Security"]).toMatch(/max-age=\d+; includeSubDomains; preload/);
    expect(map(true)["Strict-Transport-Security"]).toBeUndefined(); // no HSTS over http
  });

  it("are always set, and leave the CSP to the proxy and the route-handler rule", () => {
    const h = map(false);
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Permissions-Policy"]).toContain("camera=()");
    expect(h["Content-Security-Policy"]).toBeUndefined();
  });

  it("give route handlers a CSP with no scripts at all", () => {
    const d = directives(ROUTE_HANDLER_CSP);
    expect(d["default-src"]).toBe("'none'");
    expect(d["script-src"]).toBeUndefined(); // falls back to default-src 'none'
    expect(d["frame-ancestors"]).toBe("'none'");
  });
});

describe("error monitoring in the CSP", () => {
  it("allows only the origin of a valid https Sentry DSN, nothing for anything else", () => {
    expect(monitoringOrigin("https://abc123@o456.ingest.de.sentry.io/789")).toBe("https://o456.ingest.de.sentry.io");
    expect(monitoringOrigin("http://abc@o1.ingest.sentry.io/2")).toBeUndefined();
    expect(monitoringOrigin("not a url")).toBeUndefined();
    expect(monitoringOrigin(undefined)).toBeUndefined();
  });

  it("adds that origin to connect-src only, and leaves the policy as it was without monitoring", () => {
    const withSentry = contentSecurityPolicy({
      dev: false,
      nonce: NONCE,
      monitoring: "https://o456.ingest.de.sentry.io",
    });
    expect(withSentry).toMatch(/connect-src 'self' [^;]*https:\/\/o456\.ingest\.de\.sentry\.io/);
    expect(withSentry.match(/sentry\.io/g)).toHaveLength(1);
    expect(contentSecurityPolicy({ dev: false, nonce: NONCE, monitoring: undefined })).not.toContain("sentry");
  });
});
