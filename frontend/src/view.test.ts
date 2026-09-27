import { describe, expect, it, vi } from "vitest";
import { isProfileView, syncColorScheme } from "./view";

describe("isProfileView", () => {
  it.each([
    ["?view=profile", true],
    ["?view=modal", false],
    ["", false],
    ["?x=1&view=profile", true],
  ])("%s → %s", (search, want) => expect(isProfileView(search)).toBe(want));
});

describe("syncColorScheme", () => {
  it("aplica e acompanha a preferência do SO", () => {
    let listener: (() => void) | undefined;
    const query = {
      matches: true,
      addEventListener: vi.fn((_: string, l: () => void) => (listener = l)),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList;
    const root = document.createElement("html");

    const stop = syncColorScheme(query, root);
    expect(root.classList.contains("dark")).toBe(true);

    (query as { matches: boolean }).matches = false;
    listener!();
    expect(root.classList.contains("dark")).toBe(false);

    stop();
    expect(query.removeEventListener).toHaveBeenCalledWith("change", listener);
  });
});
