import { vi } from "vitest";

// Stand-in for the generated ImproveService binding module. Every method
// returns a real (non-cancellable) Promise, which is enough for the hook —
// it never calls `.cancel()` on the results.
export const ImproveService = {
  Cancel: vi.fn().mockResolvedValue(undefined),
  Close: vi.fn().mockResolvedValue(undefined),
  Copy: vi.fn().mockResolvedValue(undefined),
  GetState: vi.fn().mockResolvedValue({
    text: "",
    actions: [],
    canReplace: true,
    warning: "",
    error: "",
  }),
  Replace: vi.fn().mockResolvedValue(undefined),
  Start: vi.fn().mockResolvedValue("req-1"),
};

export function resetImproveServiceMock() {
  ImproveService.Cancel.mockClear();
  ImproveService.Close.mockClear();
  ImproveService.Copy.mockClear();
  ImproveService.Replace.mockClear();
  ImproveService.Start.mockClear();
  ImproveService.GetState.mockClear();
  ImproveService.GetState.mockResolvedValue({
    text: "",
    actions: [],
    canReplace: true,
    warning: "",
    error: "",
  });
}
