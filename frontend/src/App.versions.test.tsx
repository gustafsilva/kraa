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

  it("navega pelo code físico em teclados ABNT2", async () => {
    await renderWithVersion();
    fireEvent.keyDown(window, { key: "´", code: "BracketLeft", ctrlKey: true });
    expect(screen.getByText("1/2")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "[", code: "BracketRight", ctrlKey: true });
    expect(screen.getByText("2/2")).toBeInTheDocument();
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

  it("o botão Mudanças do VersionNav também alterna o diff", async () => {
    await renderWithVersion();
    const toggle = screen.getByRole("button", { name: /Mudanças/ });
    await userEvent.click(toggle);
    expect(screen.getByRole("region", { name: "Mudanças" })).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.queryByRole("region", { name: "Mudanças" })).not.toBeInTheDocument();
  });
});
