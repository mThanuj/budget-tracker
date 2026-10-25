// @vitest-environment jsdom
import "./setup";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const checkPaymentStatus = vi.hoisted(() => vi.fn());
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
const refresh = router.refresh;
vi.mock("@/server/actions/billing", () => ({ checkPaymentStatus }));
// Like Next's, the router object is the same on every render.
vi.mock("next/navigation", async (original) => ({ ...(await original<typeof import("next/navigation")>()), useRouter: () => router }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const { Activating } = await import("@/components/billing/activating");
const tick = () => act(() => vi.advanceTimersByTimeAsync(4_000));

describe("confirming a payment", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.useRealTimers());

  it("refreshes the page once Pro is on", async () => {
    checkPaymentStatus.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<Activating />);
    await tick();
    await tick();
    expect(checkPaymentStatus).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
    await tick();
    expect(checkPaymentStatus).toHaveBeenCalledTimes(2); // stops checking
  });

  it("never has two checks in flight, however slow one is", async () => {
    checkPaymentStatus.mockReturnValue(new Promise(() => {})); // never answers
    render(<Activating />);
    for (let i = 0; i < 5; i++) await tick();
    expect(checkPaymentStatus).toHaveBeenCalledTimes(1);
  });

  it("keeps trying when a check fails", async () => {
    checkPaymentStatus.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(true);
    render(<Activating />);
    await tick();
    await tick();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("says so after 15 tries, without erroring", async () => {
    checkPaymentStatus.mockResolvedValue(false);
    render(<Activating />);
    for (let i = 0; i < 16; i++) await tick();
    expect(checkPaymentStatus).toHaveBeenCalledTimes(15);
    expect(screen.getByText("Still confirming your payment")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });
});
