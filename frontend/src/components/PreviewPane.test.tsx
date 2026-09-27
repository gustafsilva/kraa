import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PreviewPane } from "./PreviewPane";

describe("<PreviewPane />", () => {
  it("é um card com título Resultado", () => {
    const { container } = render(<PreviewPane value="" onChange={vi.fn()} editable={false} />);
    expect(screen.getByText("Resultado")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="preview-card"]')).not.toBeNull();
  });

  it("mostra o selo Escrevendo… só durante o stream", () => {
    const { rerender } = render(<PreviewPane value="Olá" onChange={vi.fn()} editable={false} streaming />);
    expect(screen.getByText("Escrevendo…")).toBeInTheDocument();
    rerender(<PreviewPane value="Olá" onChange={vi.fn()} editable />);
    expect(screen.queryByText("Escrevendo…")).not.toBeInTheDocument();
  });

  it("só é editável quando editable", () => {
    const { rerender } = render(<PreviewPane value="x" onChange={vi.fn()} editable={false} />);
    expect(screen.getByRole("textbox", { name: /pré-visualização/i })).toHaveAttribute("readonly");
    rerender(<PreviewPane value="x" onChange={vi.fn()} editable />);
    expect(screen.getByRole("textbox", { name: /pré-visualização/i })).not.toHaveAttribute("readonly");
  });

  it("mostra o mascote só com o resultado vazio", () => {
    const { container, rerender } = render(<PreviewPane value="" onChange={vi.fn()} editable={false} mascot="wave" />);
    expect(container.querySelector('[data-slot="mascot"]')).not.toBeNull();
    rerender(<PreviewPane value="texto" onChange={vi.fn()} editable mascot="wave" />);
    expect(container.querySelector('[data-slot="mascot"]')).toBeNull();
  });

  it("editar o campo editável chama onChange com o texto digitado", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PreviewPane value="" onChange={onChange} editable />);

    await user.type(screen.getByRole("textbox", { name: /pré-visualização/i }), "a");

    expect(onChange).toHaveBeenCalledWith("a");
  });
});
