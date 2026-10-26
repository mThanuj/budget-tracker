import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

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
  // Vercel gives every request an x-vercel-id; elsewhere, add an id so a
  // request's log lines and error reports can be tied together.
  if (request.headers.has("x-vercel-id") || request.headers.has("x-request-id")) return NextResponse.next();
  const headers = new Headers(request.headers);
  headers.set("x-request-id", crypto.randomUUID());
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Skip API routes, Next.js internals and static files.
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
