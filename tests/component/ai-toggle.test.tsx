// @vitest-environment jsdom
import "./setup";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const setAiEnabled = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/server/actions/settings", () => ({ setAiEnabled }));
vi.mock("sonner", () => ({ toast }));

const { AiToggle } = await import("@/components/settings/ai-toggle");

describe("AI features switch", () => {
  it("saves the change and confirms it", async () => {
    setAiEnabled.mockResolvedValue({ ok: true });
    render(<AiToggle enabled />);
    await userEvent.setup().click(screen.getByRole("switch", { name: "AI features" }));
    expect(setAiEnabled).toHaveBeenCalledWith(false);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("AI features switched off"));
  });

  it("doesn't claim success, and flips back, when saving fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    setAiEnabled.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<AiToggle enabled />);
    const toggle = screen.getByRole("switch", { name: "AI features" });
    await userEvent.setup().click(toggle);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("That didn't go through. Check your connection and try again."),
    );
    expect(toast.success).not.toHaveBeenCalled();
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true")); // still on
  });
});
