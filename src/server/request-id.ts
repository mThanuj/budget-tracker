// No "server-only" import: src/instrumentation.ts loads this for error reports,
// outside React's server environment, where that import throws. Nothing here
// is secret, and client code can't import src/server/ (tests/security/static.test.ts).
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";

type HeaderSource = Headers | Record<string, string | string[] | undefined>;

/**
 * The id that ties a request's log lines and error reports together: Vercel's
 * `x-vercel-id`, or the `x-request-id` that src/proxy.ts adds on other hosts.
 */
export function requestIdFrom(source: HeaderSource): string | undefined {
  const get = (name: string) => {
    const v = source instanceof Headers ? source.get(name) : source[name];
    return (Array.isArray(v) ? v[0] : v) || undefined;
  };
  return get("x-vercel-id") ?? get("x-request-id");
}

/** The current request's id, inside a server action or route handler. */
export async function currentRequestId(): Promise<string | undefined> {
  try {
    return requestIdFrom(await headers());
  } catch (err) {
    unstable_rethrow(err); // Next's own signals (e.g. while prerendering) must pass through
    return undefined; // outside a request (a script or test): there's no id to add
  }
}
