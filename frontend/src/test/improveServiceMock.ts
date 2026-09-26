import { vi } from "vitest";

// Stand-in for the generated ImproveService binding module. Every method
// returns a real (non-cancellable) Promise, which is enough for the hook —
// it never calls `.cancel()` on the results.
export const ImproveService = {
  Cancel: vi.fn().mockResolvedValue(undefined),
  Close: vi.fn().mockResolvedValue(undefined),
  CloseProfile: vi.fn().mockResolvedValue(undefined),
  Copy: vi.fn().mockResolvedValue(undefined),
  GetState: vi.fn().mockResolvedValue({
    text: "",
    actions: [],
    canReplace: true,
    warning: "",
    error: "",
    model: "",
  }),
  GetProfile: vi.fn().mockResolvedValue({ enabled: false, text: "" }),
  ListModels: vi.fn().mockResolvedValue([]),
  Replace: vi.fn().mockResolvedValue(undefined),
  SaveProfile: vi.fn().mockResolvedValue(undefined),
  SetModel: vi.fn().mockResolvedValue(undefined),
  Start: vi.fn().mockResolvedValue("req-1"),
};

export function resetImproveServiceMock() {
  ImproveService.Cancel.mockClear();
  ImproveService.Close.mockClear();
  ImproveService.Copy.mockClear();
  ImproveService.Replace.mockClear();
  ImproveService.Start.mockClear();
  ImproveService.GetState.mockClear();
  ImproveService.ListModels.mockReset();
  ImproveService.ListModels.mockResolvedValue([]);
  ImproveService.SetModel.mockReset();
  ImproveService.SetModel.mockResolvedValue(undefined);
  ImproveService.CloseProfile.mockClear();
  ImproveService.GetProfile.mockReset();
  ImproveService.GetProfile.mockResolvedValue({ enabled: false, text: "" });
  ImproveService.SaveProfile.mockReset();
  ImproveService.SaveProfile.mockResolvedValue(undefined);
  ImproveService.GetState.mockResolvedValue({
    text: "",
    actions: [],
    canReplace: true,
    warning: "",
    error: "",
    model: "",
  });
}
