import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RefineInput } from "./RefineInput";

describe("<RefineInput />", () => {
  it("envia o texto aparado com Enter e limpa o campo", async () => {
    const onSubmit = vi.fn();
    render(<RefineInput onSubmit={onSubmit} />);
    const box = screen.getByRole("textbox", { name: "Refinar" });
    await userEvent.type(box, "  mais direto  {Enter}");
    expect(onSubmit).toHaveBeenCalledWith("mais direto");
    expect(box).toHaveValue("");
  });

  it("não envia texto vazio", async () => {
    const onSubmit = vi.fn();
    render(<RefineInput onSubmit={onSubmit} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Refinar" }), "   {Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("não envia com ⌘/Ctrl+Enter (reservado para Substituir)", async () => {
    const onSubmit = vi.fn();
    render(<RefineInput onSubmit={onSubmit} />);
    const box = screen.getByRole("textbox", { name: "Refinar" });
    await userEvent.type(box, "curto");
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("fica desabilitado quando disabled", () => {
    render(<RefineInput onSubmit={vi.fn()} disabled />);
    expect(screen.getByRole("textbox", { name: "Refinar" })).toBeDisabled();
  });

  it("foca quando focusToken muda", () => {
    const { rerender } = render(<RefineInput onSubmit={vi.fn()} focusToken={0} />);
    rerender(<RefineInput onSubmit={vi.fn()} focusToken={1} />);
    expect(screen.getByRole("textbox", { name: "Refinar" })).toHaveFocus();
  });
});
