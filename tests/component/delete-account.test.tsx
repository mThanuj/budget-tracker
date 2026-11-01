// @vitest-environment jsdom
import "./setup";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const deleteAccount = vi.hoisted(() => vi.fn());
vi.mock("@/server/actions/account", () => ({ deleteAccount }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
// The real button starts Google sign-in through Better Auth's browser client.
const signInButton = vi.hoisted(() => vi.fn());
vi.mock("@/components/auth/google-sign-in-button", () => ({
  GoogleSignInButton: (props: { label: string; callbackURL: string }) => {
    signInButton(props);
    return <button type="button">{props.label}</button>;
  },
}));

const { DeleteAccount } = await import("@/components/settings/delete-account");

async function openAndType(text: string) {
  const user = userEvent.setup();
  render(<DeleteAccount pro={false} />);
  await user.click(screen.getByRole("button", { name: "Delete account" }));
  const dialog = await screen.findByRole("alertdialog", { name: "Delete your account?" });
  if (text) await user.type(screen.getByLabelText("Type DELETE to confirm"), text);
  return { user, dialog, confirm: screen.getByRole("button", { name: "Delete everything" }) };
}

describe("deleting the account", () => {
  it("can't be confirmed until DELETE is typed", async () => {
    const { confirm, user } = await openAndType("delet");
    expect(confirm.hasAttribute("disabled")).toBe(true);
    await user.type(screen.getByLabelText("Type DELETE to confirm"), "e"); // any case
    expect(confirm.hasAttribute("disabled")).toBe(false);
  });

  it("shows the server's reason when it refuses", async () => {
    deleteAccount.mockResolvedValue({
      ok: false,
      error: "We couldn't cancel your Pro renewal, so nothing was deleted.",
    });
    const { confirm, user } = await openAndType("DELETE");
    await user.click(confirm);
    expect(deleteAccount).toHaveBeenCalledWith("DELETE");
    expect((await screen.findByRole("alert")).textContent).toBe(
      "We couldn't cancel your Pro renewal, so nothing was deleted.",
    );
  });

  it("asks for a fresh Google sign-in when the server wants one, coming back to Settings", async () => {
    deleteAccount.mockResolvedValue({
      ok: false,
      error: "For your safety, sign in with Google again, then delete.",
      signInAgain: true,
    });
    const { confirm, user } = await openAndType("DELETE");
    expect(screen.queryByRole("button", { name: "Sign in again" })).toBeNull();
    await user.click(confirm);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "For your safety, sign in with Google again, then delete.",
    );
    expect(await screen.findByRole("button", { name: "Sign in again" })).toBeTruthy();
    expect(signInButton).toHaveBeenLastCalledWith(expect.objectContaining({ callbackURL: "/settings" }));
  });

  it("says the request didn't go through, and stays open", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    deleteAccount.mockRejectedValue(new TypeError("Failed to fetch"));
    const { confirm, user } = await openAndType("DELETE");
    await user.click(confirm);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "That didn't go through. Check your connection and try again.",
    );
    expect(screen.getByRole("alertdialog", { name: "Delete your account?" })).toBeTruthy();
  });
});
