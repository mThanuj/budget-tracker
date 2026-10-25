// Shared by the component tests (they run in jsdom). Vitest isn't configured
// with globals, so Testing Library's automatic cleanup doesn't register itself.
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// jsdom has no matchMedia; components read it for reduced motion.
if (typeof window.matchMedia !== "function") {
  const noop = () => undefined;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: noop,
      removeEventListener: noop,
      addListener: noop,
      removeListener: noop,
      dispatchEvent: () => false,
    }),
  });
}
// jsdom has no scrollIntoView; the chat scrolls to the newest message.
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
