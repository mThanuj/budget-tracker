// @vitest-environment jsdom
import "./setup";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const askMoney = vi.hoisted(() => vi.fn());
vi.mock("@/server/actions/chat", () => ({ askMoney }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const { ChatPanel } = await import("@/components/ask/chat-panel");
const panel = (props: Partial<Parameters<typeof ChatPanel>[0]> = {}) =>
  render(<ChatPanel available initialLeft={10} initialQuestion={null} proDaily={null} {...props} />);

async function ask(text: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Your question"), text);
  await user.click(screen.getByRole("button", { name: "Send" }));
}

describe("money chat", () => {
  it("shows the answer, what it looked up and the questions left", async () => {
    askMoney.mockResolvedValue({ ok: true, text: "You spent **₹2,380** on groceries.", lookedUp: ["spending"], left: 9 });
    panel();
    await ask("How much on groceries?");
    expect(askMoney).toHaveBeenCalledWith([{ role: "user", content: "How much on groceries?" }]);
    expect(await screen.findByText("₹2,380")).toBeTruthy();
    expect(screen.getByText("Looked up: spending")).toBeTruthy();
    expect(screen.getByText(/9 questions left today/)).toBeTruthy();
  });

  it("keeps the conversation and says so when the request doesn't go through", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    askMoney.mockRejectedValue(new TypeError("Failed to fetch"));
    panel();
    await ask("Am I over budget?");
    expect(await screen.findByText("That didn't go through. Check your connection and try again.")).toBeTruthy();
    expect(screen.getByText("Am I over budget?")).toBeTruthy(); // the question is still there
    expect(screen.getByText(/10 questions left today/)).toBeTruthy(); // nothing was used up
  });

  it("explains the daily limit and points Free users at Pro", async () => {
    askMoney.mockResolvedValue({ ok: false, reason: "limit", left: 0, upgrade: true });
    panel({ proDaily: 100 });
    await ask("One more?");
    expect(await screen.findByText("You've used today's questions. They reset tomorrow.")).toBeTruthy();
    expect(screen.getByText("Pro gives you 100 questions a day.", { exact: false })).toBeTruthy();
    expect(screen.getByRole("link", { name: "See Pro" }).getAttribute("href")).toBe("/billing");
  });

  it("asks nothing while AI is switched off, and says where to turn it on", () => {
    panel({ available: false });
    expect(screen.getByRole("heading", { name: "AI features are off" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
    expect(screen.queryByLabelText("Your question")).toBeNull();
  });

  it("can't send an empty question", async () => {
    panel();
    expect(screen.getByRole("button", { name: "Send" }).hasAttribute("disabled")).toBe(true);
    await userEvent.setup().type(screen.getByLabelText("Your question"), "   ");
    expect(screen.getByRole("button", { name: "Send" }).hasAttribute("disabled")).toBe(true);
    expect(askMoney).not.toHaveBeenCalled();
  });
});
