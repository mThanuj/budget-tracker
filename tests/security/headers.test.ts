import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, monitoringOrigin, securityHeaders } from "@/lib/security-headers";

const map = (dev: boolean) => Object.fromEntries(securityHeaders({ dev }).map((h) => [h.key, h.value]));
const directives = (dev: boolean) =>
  Object.fromEntries(
    contentSecurityPolicy({ dev })
      .split("; ")
      .map((d) => {
        const [k, ...v] = d.split(" ");
        return [k, v.join(" ")];
      }),
  );

describe("security headers", () => {
  it("locks down the dangerous script and framing surfaces", () => {
    const d = directives(false);
    expect(d["object-src"]).toBe("'none'");
    expect(d["base-uri"]).toBe("'self'"); // blocks <base> hijacking
    expect(d["frame-ancestors"]).toBe("'none'"); // clickjacking
    expect(d["form-action"]).toBe("'self'"); // no cross-site form exfil
    expect(d["default-src"]).toBe("'self'");
    // Scripts may be inlined (Next's bootstrap) but only loaded from us + Razorpay.
    expect(d["script-src"]).toBe("'self' 'unsafe-inline' https://checkout.razorpay.com");
    expect(d["script-src"]).not.toContain("'unsafe-eval'"); // never in production
  });

  it("allows eval only in development (React Fast Refresh needs it)", () => {
    expect(directives(true)["script-src"]).toContain("'unsafe-eval'");
    expect(directives(false)["script-src"]).not.toContain("'unsafe-eval'");
  });

  it("allows exactly the external origins the app needs", () => {
    const d = directives(false);
    expect(d["img-src"]).toContain("https://*.googleusercontent.com"); // Google avatars
    expect(d["connect-src"]).toContain("https://api.razorpay.com");
    expect(d["frame-src"]).toContain("https://checkout.razorpay.com");
  });

  it("is HTTPS-strict in production, dev-friendly otherwise", () => {
    const prod = map(false);
    expect(prod["Strict-Transport-Security"]).toMatch(/max-age=\d+; includeSubDomains; preload/);
    expect(prod["Content-Security-Policy"]).toContain("upgrade-insecure-requests");
    expect(prod["Content-Security-Policy"]).not.toContain("ws:");

    const dev = map(true);
    expect(dev["Strict-Transport-Security"]).toBeUndefined(); // no HSTS over http
    expect(dev["Content-Security-Policy"]).not.toContain("upgrade-insecure-requests");
    expect(dev["Content-Security-Policy"]).toContain("ws:"); // Turbopack hot reload
  });

  it("always sets the supporting headers", () => {
    const h = map(false);
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Permissions-Policy"]).toContain("camera=()");
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
    const withSentry = contentSecurityPolicy({ dev: false, monitoring: "https://o456.ingest.de.sentry.io" });
    expect(withSentry).toMatch(/connect-src 'self' [^;]*https:\/\/o456\.ingest\.de\.sentry\.io/);
    expect(withSentry.match(/sentry\.io/g)).toHaveLength(1);
    expect(contentSecurityPolicy({ dev: false, monitoring: undefined })).not.toContain("sentry");
  });
});
