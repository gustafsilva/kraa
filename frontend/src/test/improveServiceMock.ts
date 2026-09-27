import { vi } from "vitest";
import type * as RealService from "../../bindings/github.com/gustavofreitas/kraa/internal/app/improveservice";

// Stand-in for the generated ImproveService binding (aliased in
// vitest.config.ts). `satisfies` makes `npm run typecheck` fail when a Go
// method is added/renamed and the mock isn't. Every method returns a plain
// Promise; the app never calls `.cancel()` on the results.
const defaultState = () => ({
  text: "",
  actions: [],
  canReplace: true,
  warning: "",
  error: "",
  model: "",
});

export const ImproveService = {
  Cancel: vi.fn(),
  Close: vi.fn(),
  CloseProfile: vi.fn(),
  Copy: vi.fn(),
  GetState: vi.fn(),
  GetProfile: vi.fn(),
  ListModels: vi.fn(),
  Replace: vi.fn(),
  SaveProfile: vi.fn(),
  SetModel: vi.fn(),
  Start: vi.fn(),
} satisfies Record<keyof typeof RealService, unknown>;

function applyDefaults() {
  ImproveService.Cancel.mockResolvedValue(undefined);
  ImproveService.Close.mockResolvedValue(undefined);
  ImproveService.CloseProfile.mockResolvedValue(undefined);
  ImproveService.Copy.mockResolvedValue(undefined);
  ImproveService.GetState.mockResolvedValue(defaultState());
  ImproveService.GetProfile.mockResolvedValue({ enabled: false, text: "" });
  ImproveService.ListModels.mockResolvedValue([]);
  ImproveService.Replace.mockResolvedValue(undefined);
  ImproveService.SaveProfile.mockResolvedValue(undefined);
  ImproveService.SetModel.mockResolvedValue(undefined);
  ImproveService.Start.mockResolvedValue("req-1");
}
applyDefaults();

/** mockReset on every method (drops Once *and* persistent implementations), then defaults. */
export function resetImproveServiceMock() {
  for (const fn of Object.values(ImproveService)) fn.mockReset();
  applyDefaults();
}
