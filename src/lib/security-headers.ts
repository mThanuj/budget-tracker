// Security response headers, applied to every route by next.config.ts. Kept as
// a pure, testable function.

export type HttpHeader = { key: string; value: string };

// Razorpay Checkout loads a script and opens an iframe from these origins, and
// its script calls these APIs from our page. Always allowed (even while
// BILLING_ENABLED is off) so turning payments on never silently breaks checkout.
const RAZORPAY_SCRIPT = "https://checkout.razorpay.com";
const RAZORPAY_CONNECT = "https://api.razorpay.com https://lumberjack.razorpay.com";
const RAZORPAY_FRAME = "https://checkout.razorpay.com https://api.razorpay.com";
// Google account profile photos (the avatar's src).
const GOOGLE_IMG = "https://*.googleusercontent.com";

/**
 * The Content-Security-Policy.
 *
 * Next's App Router emits per-page inline bootstrap scripts whose content isn't
 * known ahead of time, so a hash or nonce would force every page to render
 * dynamically and defeat cacheComponents/PPR. We keep static rendering and
 * instead (a) restrict where scripts may be LOADED from to 'self' + Razorpay,
 * and (b) lock down base-uri, object-src, frame-ancestors and form-action —
 * which is what actually blocks script-injection escalation, clickjacking,
 * <base> hijacking and form-based exfiltration. The app has no inline-script
 * injection sink: AI output renders as React text nodes, and the only inline
 * script is the static theme snippet.
 *
 * To move to a nonce-based strict CSP later, generate a nonce in proxy.ts,
 * pass it through, and accept that document responses become dynamic.
 */
export function contentSecurityPolicy({ dev }: { dev: boolean }): string {
  const directives: Record<string, string> = {
    "default-src": "'self'",
    // 'unsafe-eval' is needed ONLY in development: React Fast Refresh and the
    // Turbopack dev runtime use eval() for debugging. Production stays strict.
    "script-src": `'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} ${RAZORPAY_SCRIPT}`,
    "style-src": "'self' 'unsafe-inline'",
    "img-src": `'self' data: ${GOOGLE_IMG}`,
    "font-src": "'self'",
    // ws:/wss: lets Turbopack's hot reload connect in development.
    "connect-src": `'self' ${RAZORPAY_CONNECT}${dev ? " ws: wss:" : ""}`,
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

export function securityHeaders({ dev }: { dev: boolean }): HttpHeader[] {
  const headers: HttpHeader[] = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy({ dev }) },
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
