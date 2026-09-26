import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@wailsio/runtime", async () => {
  const mod = await import("./test/wailsRuntimeMock");
  return { Events: mod.Events };
});

vi.mock("@bindings/github.com/gustavofreitas/prompt-improve/internal/app", async () => {
  const mod = await import("./test/improveServiceMock");
  return { ImproveService: mod.ImproveService };
});

import { emit, resetWailsMock } from "./test/wailsRuntimeMock";
import { ImproveService, resetImproveServiceMock } from "./test/improveServiceMock";
import App from "./App";

const actions = [
  { id: "a1", category: "Tom", label: "Deixar formal" },
  { id: "a2", category: "Tom", label: "Deixar casual" },
  { id: "b1", category: "Gramática", label: "Corrigir erros" },
];

function mockState(overrides: Partial<{
  text: string;
  actions: typeof actions;
  canReplace: boolean;
  warning: string;
  error: string;
}> = {}) {
  return {
    text: "Texto capturado de teste",
    actions,
    canReplace: true,
    warning: "",
    error: "",
    ...overrides,
  };
}

async function renderAppHydrated(state = mockState()) {
  ImproveService.GetState.mockResolvedValueOnce(state);
  render(<App />);
  await waitFor(() => expect(ImproveService.GetState).toHaveBeenCalled());
  await screen.findByText(state.actions[0]?.label ?? "");
  return state;
}

describe("<App />", () => {
  beforeEach(() => {
    resetWailsMock();
    resetImproveServiceMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renderiza as ações agrupadas por categoria", async () => {
    await renderAppHydrated();

    expect(screen.getByText("Tom")).toBeInTheDocument();
    expect(screen.getByText("Gramática")).toBeInTheDocument();
    expect(screen.getByText("Deixar formal")).toBeInTheDocument();
    expect(screen.getByText("Deixar casual")).toBeInTheDocument();
    expect(screen.getByText("Corrigir erros")).toBeInTheDocument();
  });

  it("Enter numa ação filtrada chama Start com actionId", async () => {
    const user = userEvent.setup();
    await renderAppHydrated();

    const search = screen.getByRole("combobox", { name: /buscar ação/i });
    await user.click(search);
    await user.type(search, "Corrigir");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(ImproveService.Start).toHaveBeenCalledWith({
        text: "Texto capturado de teste",
        actionId: "b1",
        freeInstruction: "",
      })
    );
  });

  it("instrução livre e Enter chamam Start com freeInstruction", async () => {
    const user = userEvent.setup();
    await renderAppHydrated();

    const freeInput = screen.getByRole("textbox", { name: /instrução livre/i });
    await user.type(freeInput, "deixe mais direto{Enter}");

    await waitFor(() =>
      expect(ImproveService.Start).toHaveBeenCalledWith({
        text: "Texto capturado de teste",
        actionId: "",
        freeInstruction: "deixe mais direto",
      })
    );
  });

  it("os chunks de improve:chunk aparecem no preview conforme chegam", async () => {
    ImproveService.Start.mockResolvedValueOnce("req-1");
    await renderAppHydrated();

    act(() => {
      emit("selection:new", { text: "Texto capturado de teste", canReplace: true, warning: "" });
    });

    await act(async () => {
      const user = userEvent.setup();
      const freeInput = screen.getByRole("textbox", { name: /instrução livre/i });
      await user.type(freeInput, "melhore{Enter}");
    });

    await waitFor(() => expect(ImproveService.Start).toHaveBeenCalled());

    act(() => {
      emit("improve:chunk", { id: "req-1", delta: "Olá" });
      emit("improve:chunk", { id: "req-1", delta: " mundo" });
    });

    const preview = screen.getByRole("textbox", { name: /pré-visualização/i }) as HTMLTextAreaElement;
    expect(preview.value).toBe("Olá mundo");
    expect(preview).toHaveAttribute("readonly");

    act(() => {
      emit("improve:done", { id: "req-1", text: "Olá mundo, limpo." });
    });

    expect(preview.value).toBe("Olá mundo, limpo.");
    expect(preview).not.toHaveAttribute("readonly");
  });

  it("canReplace=false esconde o botão Substituir e mostra o aviso", async () => {
    await renderAppHydrated(
      mockState({ canReplace: false, warning: "Nenhum app compatível para colar." })
    );

    expect(screen.queryByRole("button", { name: /substituir/i })).not.toBeInTheDocument();
    expect(screen.getByText("Nenhum app compatível para colar.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copiar/i })).toBeInTheDocument();
  });

  it("um erro de improve:error mostra Alert com Tentar novamente, que reenvia o pedido", async () => {
    ImproveService.Start.mockResolvedValueOnce("req-err");
    await renderAppHydrated();

    const search = screen.getByRole("combobox", { name: /buscar ação/i });
    await userEvent.setup().type(search, "Corrigir{Enter}");
    await waitFor(() => expect(ImproveService.Start).toHaveBeenCalledTimes(1));

    act(() => {
      emit("improve:error", { id: "req-err", message: "Falha ao contatar o provedor." });
    });

    expect(screen.getByText("Falha ao contatar o provedor.")).toBeInTheDocument();
    const retryButton = screen.getByRole("button", { name: /tentar novamente/i });

    ImproveService.Start.mockResolvedValueOnce("req-err-2");
    await userEvent.setup().click(retryButton);

    await waitFor(() => expect(ImproveService.Start).toHaveBeenCalledTimes(2));
    expect(ImproveService.Start).toHaveBeenLastCalledWith({
      text: "Texto capturado de teste",
      actionId: "b1",
      freeInstruction: "",
    });
  });

  it("Copiar chama Copy e depois Close", async () => {
    ImproveService.Start.mockResolvedValueOnce("req-1");
    await renderAppHydrated();

    const search = screen.getByRole("combobox", { name: /buscar ação/i });
    await userEvent.setup().type(search, "Corrigir{Enter}");
    await waitFor(() => expect(ImproveService.Start).toHaveBeenCalledTimes(1));

    act(() => {
      emit("improve:done", { id: "req-1", text: "Resultado final." });
    });

    const copyButton = await screen.findByRole("button", { name: /copiar/i });
    await userEvent.setup().click(copyButton);

    await waitFor(() => expect(ImproveService.Close).toHaveBeenCalledTimes(1));
    expect(ImproveService.Copy).toHaveBeenCalledWith("Resultado final.");
    const copyOrder = ImproveService.Copy.mock.invocationCallOrder[0];
    const closeOrder = ImproveService.Close.mock.invocationCallOrder[0];
    expect(copyOrder).toBeLessThan(closeOrder);
  });

  it("state:changed com erro mostra um Alert destrutivo no topo", async () => {
    await renderAppHydrated();

    act(() => {
      emit("state:changed", mockState({ error: "Falha ao carregar configuração." }));
    });

    expect(screen.getByText("Erro de configuração")).toBeInTheDocument();
    expect(screen.getByText("Falha ao carregar configuração.")).toBeInTheDocument();
  });
});
