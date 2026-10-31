import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, newNonce } from "@/lib/security-headers";

// Pages anyone can see. Everything else requires a session cookie.
const PUBLIC_PATHS = new Set(["/", "/privacy", "/terms", "/refund", "/contact"]);

// Optimistic check only (cookie present?). Real authorization happens in
// requireUser() on the server, close to the data.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = getSessionCookie(request) !== null;

  // "?signed-out" means the server found no valid session behind the cookie;
  // sending that visitor to the dashboard again would loop.
  if (pathname === "/" && hasSession && !request.nextUrl.searchParams.has("signed-out")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  if (!PUBLIC_PATHS.has(pathname) && !hasSession) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  const headers = new Headers(request.headers);
  // A fresh nonce for every page (D-027): Next reads it from the request's CSP
  // and puts it on its own scripts; the browser gets the same policy.
  const csp = contentSecurityPolicy({ dev: process.env.NODE_ENV !== "production", nonce: newNonce() });
  headers.set("content-security-policy", csp);
  // Vercel gives every request an x-vercel-id; elsewhere, add an id so a
  // request's log lines and error reports can be tied together.
  if (!request.headers.has("x-vercel-id") && !request.headers.has("x-request-id")) {
    headers.set("x-request-id", crypto.randomUUID());
  }
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Skip API routes, Next.js internals and static files. Must stay a literal (Next
  // reads it at build time) and the exact complement of headerRules' fixed-CSP
  // paths (src/lib/security-headers.ts), so every path has one CSP (D-029).
  matcher: ["/((?!api(?:/|$)|_next/static|_next/image|.*\\..*).*)"],
};
