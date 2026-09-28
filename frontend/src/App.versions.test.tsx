import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import App from "./App";
import { emit } from "./test/wailsRuntimeMock";
import { ImproveService } from "./test/improveServiceMock";

async function renderWithVersion() {
  render(<App />);
  await waitFor(() => expect(ImproveService.GetState).toHaveBeenCalled());
  act(() => {
    emit("state:changed", {
      text: "",
      actions: [{ id: "formal", category: "Mensagem", label: "Mais formal" }],
      canReplace: true,
      warning: "",
      error: "",
      model: "m",
    });
    emit("selection:new", { text: "fala galera", canReplace: true, warning: "" });
  });
  ImproveService.Start.mockResolvedValueOnce("r1");
  await userEvent.click(screen.getByRole("option", { name: /Mais formal/ }));
  await act(async () => emit("improve:done", { id: "r1", text: "Prezados, tudo bem?" }));
  ImproveService.Start.mockResolvedValueOnce("r2");
  await act(async () => {
    fireEvent.keyDown(window, { key: "r", metaKey: true });
  });
  await act(async () => emit("improve:done", { id: "r2", text: "Caros, tudo certo?" }));
}

describe("App — versões", () => {
  it("⌘R gera de novo com mode variation e mostra 2/2", async () => {
    await renderWithVersion();
    expect(ImproveService.Start).toHaveBeenLastCalledWith(expect.objectContaining({ mode: "variation", previous: "Prezados, tudo bem?" }));
    expect(screen.getByText("2/2")).toBeInTheDocument();
  });

  it("⌘[ e ⌘] navegam pelas versões (por key)", async () => {
    await renderWithVersion();
    fireEvent.keyDown(window, { key: "[", metaKey: true });
    expect(screen.getByText("1/2")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "]", metaKey: true });
    expect(screen.getByText("2/2")).toBeInTheDocument();
  });

  it("em teclados ABNT2 segue o caractere do colchete e só cai no code sem colchete", async () => {
    await renderWithVersion();
    // ABNT2: a tecla "[" tem code BracketRight e a "]" tem code Backslash.
    fireEvent.keyDown(window, { key: "[", code: "BracketRight", ctrlKey: true });
    expect(screen.getByText("1/2")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "]", code: "Backslash", ctrlKey: true });
    expect(screen.getByText("2/2")).toBeInTheDocument();
    // Tecla morta ´ (code BracketLeft) não gera colchete: vale o code.
    fireEvent.keyDown(window, { key: "´", code: "BracketLeft", ctrlKey: true });
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("⌘R funciona em layouts não latinos pelo code (ex.: russo, key к)", async () => {
    await renderWithVersion();
    ImproveService.Start.mockResolvedValueOnce("r3");
    const event = new KeyboardEvent("keydown", { key: "к", code: "KeyR", metaKey: true, cancelable: true });
    await act(async () => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(ImproveService.Start).toHaveBeenLastCalledWith(expect.objectContaining({ mode: "variation", previous: "Caros, tudo certo?" }));
  });

  it("AltGr+colchete (ctrlKey+altKey) não troca de versão nem bloqueia a digitação", async () => {
    await renderWithVersion();
    const event = new KeyboardEvent("keydown", {
      key: "[",
      code: "Digit8",
      ctrlKey: true,
      altKey: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
    expect(screen.getByText("2/2")).toBeInTheDocument();
    expect(event.defaultPrevented).toBe(false);
  });

  it("⌘D alterna Mudanças e ⌘L foca Refinar", async () => {
    await renderWithVersion();
    fireEvent.keyDown(window, { key: "d", metaKey: true });
    expect(screen.getByRole("region", { name: "Mudanças" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "d", metaKey: true });
    expect(screen.queryByRole("region", { name: "Mudanças" })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "l", metaKey: true });
    expect(screen.getByRole("textbox", { name: "Refinar" })).toHaveFocus();
  });

  it("Refinar envia mode refine com a versão atual", async () => {
    await renderWithVersion();
    ImproveService.Start.mockResolvedValueOnce("r3");
    await userEvent.type(screen.getByRole("textbox", { name: "Refinar" }), "mais curto{Enter}");
    expect(ImproveService.Start).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: "refine", text: "Caros, tudo certo?", freeInstruction: "mais curto" })
    );
  });

  it("⌘R chama preventDefault para não recarregar a webview", async () => {
    await renderWithVersion();
    const event = new KeyboardEvent("keydown", { key: "r", metaKey: true, cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("erro num refino volta à versão anterior, com Substituir, Copiar e Refinar disponíveis", async () => {
    await renderWithVersion();
    ImproveService.Start.mockResolvedValueOnce("r3");
    await userEvent.type(screen.getByRole("textbox", { name: "Refinar" }), "mais curto{Enter}");
    await act(async () => {
      emit("improve:chunk", { id: "r3", delta: "parcial" });
      emit("improve:error", { id: "r3", message: "Tempo esgotado aguardando o modelo. Tente novamente." });
    });
    expect(screen.getByDisplayValue("Caros, tudo certo?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Substituir/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Copiar/ })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: "Refinar" })).toBeInTheDocument();
  });

  it("selection:new desliga Mudanças", async () => {
    await renderWithVersion();
    fireEvent.keyDown(window, { key: "d", metaKey: true });
    expect(screen.getByRole("region", { name: "Mudanças" })).toBeInTheDocument();
    act(() => {
      emit("selection:new", { text: "outro texto", canReplace: true, warning: "" });
    });
    expect(screen.queryByRole("region", { name: "Mudanças" })).not.toBeInTheDocument();
  });

  it("o botão Mudanças do VersionNav também alterna o diff", async () => {
    await renderWithVersion();
    const toggle = screen.getByRole("button", { name: /Mudanças/ });
    await userEvent.click(toggle);
    expect(screen.getByRole("region", { name: "Mudanças" })).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.queryByRole("region", { name: "Mudanças" })).not.toBeInTheDocument();
  });
});
