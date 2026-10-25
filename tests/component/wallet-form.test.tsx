// @vitest-environment jsdom
import "./setup";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const saveWallet = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/server/actions/wallets", () => ({ saveWallet }));
vi.mock("sonner", () => ({ toast }));

const { WalletFormDialog } = await import("@/components/wallets/wallet-form");

async function fillAndSubmit() {
  const onOpenChange = vi.fn();
  const user = userEvent.setup();
  render(<WalletFormDialog open onOpenChange={onOpenChange} currency="INR" />);
  const dialog = await screen.findByRole("dialog", { name: "Add a wallet" });
  await user.type(screen.getByLabelText("Name"), "SBI Debit");
  await user.click(screen.getByRole("button", { name: "Add wallet" }));
  return { dialog, onOpenChange };
}

describe("adding a wallet", () => {
  it("saves, confirms and closes", async () => {
    saveWallet.mockResolvedValue({ ok: true });
    const { onOpenChange } = await fillAndSubmit();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toast.success).toHaveBeenCalledWith("Wallet added");
    const sent = saveWallet.mock.calls[0][1] as FormData;
    expect(sent.get("name")).toBe("SBI Debit");
  });

  it("shows a field error next to the field", async () => {
    saveWallet.mockResolvedValue({ ok: false, fieldErrors: { name: "You already have a wallet with that name." } });
    const { onOpenChange } = await fillAndSubmit();
    expect(await screen.findByText("You already have a wallet with that name.")).toBeTruthy();
    expect(screen.getByLabelText("Name").getAttribute("aria-invalid")).toBe("true");
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("SBI Debit"); // not wiped
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("keeps what was typed when the request doesn't go through", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    saveWallet.mockRejectedValue(new TypeError("Failed to fetch"));
    const { onOpenChange } = await fillAndSubmit();
    expect(await screen.findByText("That didn't go through. Check your connection and try again.")).toBeTruthy();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("SBI Debit");
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
