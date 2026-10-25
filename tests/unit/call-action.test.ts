import { notFound, redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

const { callAction, NOT_SENT, NOT_SENT_MESSAGE } = await import("@/lib/call-action");

/** The error Next throws for redirect()/notFound(), captured as a value. */
function thrownBy(fn: () => never): unknown {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error("expected a throw");
}

describe("callAction", () => {
  beforeEach(() => {
    toastError.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("passes the action's result through untouched", async () => {
    expect(await callAction(async () => ({ ok: true }))).toEqual({ ok: true });
    expect(await callAction(async () => null)).toBeNull(); // null is a real result, not a failure
    expect(toastError).not.toHaveBeenCalled();
  });

  it("turns a failed request into NOT_SENT and tells the user", async () => {
    const result = await callAction(async () => Promise.reject(new TypeError("Failed to fetch")));
    expect(result).toBe(NOT_SENT);
    expect(toastError).toHaveBeenCalledWith(NOT_SENT_MESSAGE);
  });

  it("can stay quiet when the caller shows the message itself", async () => {
    expect(await callAction(async () => Promise.reject(new Error("500")), { notify: false })).toBe(NOT_SENT);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("lets Next's redirects and not-found signals through", async () => {
    const redirectError = thrownBy(() => redirect("/dashboard"));
    await expect(callAction(async () => Promise.reject(redirectError))).rejects.toBe(redirectError);
    const notFoundError = thrownBy(() => notFound());
    await expect(callAction(async () => Promise.reject(notFoundError))).rejects.toBe(notFoundError);
    expect(toastError).not.toHaveBeenCalled();
  });
});
