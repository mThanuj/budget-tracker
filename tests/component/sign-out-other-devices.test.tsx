// @vitest-environment jsdom
import "./setup";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const signOutOtherDevices = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/server/actions/account", () => ({ signOutOtherDevices }));
vi.mock("sonner", () => ({ toast }));

const { SignOutOtherDevices } = await import("@/components/settings/sign-out-other-devices");

describe("signing out other devices", () => {
  it("confirms once it's done", async () => {
    signOutOtherDevices.mockResolvedValue({ ok: true });
    render(<SignOutOtherDevices />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Sign out other devices" }));
    expect(signOutOtherDevices).toHaveBeenCalledOnce();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Signed out of your other devices"));
  });

  it("doesn't claim success when the request fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    signOutOtherDevices.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<SignOutOtherDevices />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Sign out other devices" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("That didn't go through. Check your connection and try again."),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });
});
