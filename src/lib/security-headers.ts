// Security response headers. Pages get their CSP, with a fresh nonce, from
// src/proxy.ts; next.config.ts sends the rest on every response, and the fixed
// route-handler CSP. Kept as pure, testable functions.

export type HttpHeader = { key: string; value: string };

// Razorpay Checkout loads a script and opens an iframe from these origins, and
// its script calls these APIs from our page. Always allowed (even while
// BILLING_ENABLED is off) so turning payments on never silently breaks checkout.
const RAZORPAY_SCRIPT = "https://checkout.razorpay.com";
const RAZORPAY_CONNECT = "https://api.razorpay.com https://lumberjack.razorpay.com";
const RAZORPAY_FRAME = "https://checkout.razorpay.com https://api.razorpay.com";
// Google account profile photos (the avatar's src).
const GOOGLE_IMG = "https://*.googleusercontent.com";

// The theme snippet in the root layout (src/components/theme/theme-script.ts),
// allowed by its hash so the layout needn't read the nonce. headers.test.ts
// fails if the snippet changes without this.
export const THEME_SCRIPT_HASH = "'sha256-dvYwNlmmBaLaFbM63+qbkg6MLCuMngYXZFGWkqZbecI='";

/** A fresh nonce for one page response (base64, as Next expects it in the CSP). */
export function newNonce(): string {
  return btoa(crypto.randomUUID());
}

/**
 * Where the browser sends error reports: the origin of the Sentry DSN, e.g.
 * https://o123.ingest.de.sentry.io. Nothing when monitoring is off or the DSN
 * isn't a valid https URL.
 */
export function monitoringOrigin(dsn = process.env.NEXT_PUBLIC_SENTRY_DSN): string | undefined {
  try {
    const url = new URL(dsn?.trim() ?? "");
    return url.protocol === "https:" ? url.origin : undefined;
  } catch {
    return undefined; // no DSN or not a URL: monitoring is off, nothing to allow
  }
}

/**
 * The Content-Security-Policy for a page (decision D-027).
 *
 * A script runs only if it carries this response's nonce (Next puts it on its
 * own scripts, reading it from the request's CSP header), is the theme snippet
 * (by hash), or was added by a script that already runs ('strict-dynamic', how
 * Razorpay's Checkout and the app's own chunks load). Browsers that know
 * 'strict-dynamic' ignore 'self' and the Razorpay host; older ones use them.
 * Every page renders per request so it can get a nonce (src/app/layout.tsx).
 * Styles stay 'unsafe-inline': toasts inject <style> and components use style={}.
 */
export function contentSecurityPolicy({
  dev,
  nonce,
  monitoring = monitoringOrigin(),
}: {
  dev: boolean;
  nonce: string;
  monitoring?: string;
}): string {
  const directives: Record<string, string> = {
    "default-src": "'self'",
    // 'unsafe-eval' is needed ONLY in development: React Fast Refresh and the
    // Turbopack dev runtime use eval() for debugging. Production stays strict.
    "script-src": `'self' 'nonce-${nonce}' 'strict-dynamic' ${THEME_SCRIPT_HASH}${dev ? " 'unsafe-eval'" : ""} ${RAZORPAY_SCRIPT}`,
    "style-src": "'self' 'unsafe-inline'",
    "img-src": `'self' data: ${GOOGLE_IMG}`,
    "font-src": "'self'",
    // ws:/wss: lets Turbopack's hot reload connect in development.
    "connect-src": `'self' ${RAZORPAY_CONNECT}${monitoring ? ` ${monitoring}` : ""}${dev ? " ws: wss:" : ""}`,
    "frame-src": RAZORPAY_FRAME,
    "worker-src": "'self' blob:",
    "object-src": "'none'",
    "base-uri": "'self'",
    "form-action": "'self'",
    "frame-ancestors": "'none'",
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v}`);
  if (!dev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

/**
 * The CSP for route handlers (src/app/api), which serve data and redirects,
 * never app pages: no scripts at all. Inline styles stay for Better Auth's
 * sign-in error page.
 */
export const ROUTE_HANDLER_CSP = "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'";

/**
 * The CSP for what the proxy never sees: files, and the 404 page for an address
 * with a dot (e.g. /x.php). Its scripts can't carry a nonce, so none run except
 * the theme snippet; the page still shows and its links still work (D-029).
 */
export const STATIC_FILE_CSP = `default-src 'none'; script-src ${THEME_SCRIPT_HASH}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`;

/**
 * The header rules next.config.ts sends. Each path gets its CSP from exactly
 * one place: src/proxy.ts for the pages it handles, these rules for the rest,
 * whose paths are the exact complement of the proxy's matcher (keep the two in
 * step; headers.test.ts checks them together). The other headers go everywhere.
 */
export function headerRules({ dev }: { dev: boolean }) {
  return [
    { source: "/:path*", headers: securityHeaders({ dev }) },
    { source: "/api/:path*", headers: [{ key: "Content-Security-Policy", value: ROUTE_HANDLER_CSP }] },
    {
      source: "/:path((?!api(?:/|$)|_next/static|_next/image).*\\..*)",
      headers: [{ key: "Content-Security-Policy", value: STATIC_FILE_CSP }],
    },
  ];
}

/** The headers every response gets (the CSP comes separately: see the top of this file). */
export function securityHeaders({ dev }: { dev: boolean }): HttpHeader[] {
  const headers: HttpHeader[] = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" }, // legacy backup for frame-ancestors
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: `camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=(self "${RAZORPAY_SCRIPT}")`,
    },
  ];
  // HSTS only means anything over HTTPS, so it's left off in http development.
  if (!dev) headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" });
  return headers;
}
