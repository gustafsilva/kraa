import "@testing-library/jest-dom/vitest";

// jsdom does not implement these APIs; cmdk (Command) and @base-ui/react
// primitives touch them during scroll/pointer-capture handling.
if (typeof window !== "undefined") {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }

  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }

  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }

  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }

  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
}

import { afterEach } from "vitest";
import { resetWailsMock } from "./wailsRuntimeMock";
import { resetImproveServiceMock } from "./improveServiceMock";

// Global reset so no test inherits listeners or mock implementations.
afterEach(() => {
  resetWailsMock();
  resetImproveServiceMock();
});
