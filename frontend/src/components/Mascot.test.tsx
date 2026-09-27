import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Mascot, type MascotPose } from "./Mascot";

describe("<Mascot />", () => {
  const poses: MascotPose[] = ["wave", "typing", "success", "error", "empty", "profile"];

  it.each(poses)("renderiza a pose %s como imagem decorativa", (pose) => {
    const { container } = render(<Mascot pose={pose} />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("data-slot", "mascot");
    expect(img).toHaveAttribute("data-pose", pose);
    expect(img).toHaveAttribute("alt", "");
    expect(img?.getAttribute("src")).toMatch(new RegExp(`${pose}\\.webp`));
  });

  it("aceita classes extras sem perder o tamanho padrão", () => {
    const { container } = render(<Mascot pose="wave" className="opacity-80" />);
    const img = container.querySelector("img")!;
    expect(img.className).toContain("opacity-80");
    expect(img).toHaveAttribute("width");
    expect(img).toHaveAttribute("height");
  });
});
