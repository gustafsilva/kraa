import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { VersionNav, type VersionNavProps } from "./VersionNav";

function setup(over: Partial<VersionNavProps> = {}) {
  const props: VersionNavProps = {
    label: "Mais formal",
    index: 1,
    total: 3,
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onRegenerate: vi.fn(),
    showDiff: false,
    onToggleDiff: vi.fn(),
    ...over,
  };
  render(<VersionNav {...props} />);
  return props;
}

describe("<VersionNav />", () => {
  it("mostra rótulo e contador", () => {
    setup();
    expect(screen.getByText("Mais formal")).toBeInTheDocument();
    expect(screen.getByText("2/3")).toBeInTheDocument();
  });

  it("aciona os callbacks", async () => {
    const p = setup();
    await userEvent.click(screen.getByRole("button", { name: "Versão anterior" }));
    await userEvent.click(screen.getByRole("button", { name: "Próxima versão" }));
    await userEvent.click(screen.getByRole("button", { name: /Gerar de novo/ }));
    await userEvent.click(screen.getByRole("button", { name: /Mudanças/ }));
    expect(p.onPrev).toHaveBeenCalledOnce();
    expect(p.onNext).toHaveBeenCalledOnce();
    expect(p.onRegenerate).toHaveBeenCalledOnce();
    expect(p.onToggleDiff).toHaveBeenCalledOnce();
  });

  it("desabilita as setas nas pontas", () => {
    setup({ index: 0, total: 1 });
    expect(screen.getByRole("button", { name: "Versão anterior" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Próxima versão" })).toBeDisabled();
  });

  it("desabilita tudo durante o stream", () => {
    setup({ disabled: true });
    for (const name of ["Versão anterior", "Próxima versão", /Gerar de novo/, /Mudanças/]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
  });

  it("reflete o estado de Mudanças em aria-pressed", () => {
    setup({ showDiff: true });
    expect(screen.getByRole("button", { name: /Mudanças/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("mostra o atalho no title", () => {
    setup();
    expect(screen.getByRole("button", { name: /Gerar de novo/ }).getAttribute("title")).toMatch(/R\)$/);
  });
});
