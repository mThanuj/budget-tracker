import { unstable_rethrow } from "next/navigation";
import { toast } from "sonner";

// For Client Components calling Server Actions. A Server Action is a network
// request: it can fail (offline, a timeout, a server error), and an uncaught
// failure inside startTransition replaces the whole page with the error
// screen, losing whatever was typed. callAction turns that into a value the
// caller can handle in place.

/** Returned instead of the action's result when the call itself failed. */
export const NOT_SENT = Symbol("not sent");

export const NOT_SENT_MESSAGE = "That didn't go through. Check your connection and try again.";

/**
 * Runs the action and returns its result, or NOT_SENT if the request failed.
 * Shows a toast unless `notify: false` (e.g. a form that shows the message
 * inline, or a background check). Next's own redirects and not-found signals
 * are re-thrown so they still work.
 */
export async function callAction<T>(call: () => Promise<T>, { notify = true } = {}): Promise<T | typeof NOT_SENT> {
  try {
    return await call();
  } catch (err) {
    unstable_rethrow(err);
    console.error("[action] call failed:", err);
    if (notify) toast.error(NOT_SENT_MESSAGE);
    return NOT_SENT;
  }
}
