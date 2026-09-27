import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@wailsio/runtime", async () => {
  const mod = await import("./test/wailsRuntimeMock");
  return { Events: mod.Events };
});

vi.mock("@bindings/github.com/gustavofreitas/kraa/internal/app", async () => {
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
  model: string;
}> = {}) {
  return {
    text: "Texto capturado de teste",
    actions,
    canReplace: true,
    warning: "",
    error: "",
    model: "llama3.2:latest",
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

  it("o texto é editável: digitar num modal vazio e escolher uma ação envia o texto digitado", async () => {
    const user = userEvent.setup();
    await renderAppHydrated(mockState({ text: "" }));

    const textBox = screen.getByRole("textbox", { name: /texto a melhorar/i });
    expect(textBox).toHaveAttribute("placeholder", "Cole ou digite o texto aqui");
    await user.type(textBox, "meu texto novo");

    const search = screen.getByRole("combobox", { name: /buscar ação/i });
    await user.type(search, "Corrigir{Enter}");

    await waitFor(() =>
      expect(ImproveService.Start).toHaveBeenCalledWith({
        text: "meu texto novo",
        actionId: "b1",
        freeInstruction: "",
      })
    );
  });

  it("state:changed depois de uma edição mantém o texto editado", async () => {
    const user = userEvent.setup();
    await renderAppHydrated();

    const textBox = screen.getByRole("textbox", { name: /texto a melhorar/i }) as HTMLTextAreaElement;
    await user.clear(textBox);
    await user.type(textBox, "editado");

    act(() => {
      emit("state:changed", mockState({ text: "Texto capturado de teste" }));
    });

    expect(textBox.value).toBe("editado");
  });

  it("selection:new substitui o texto editado", async () => {
    const user = userEvent.setup();
    await renderAppHydrated();

    const textBox = screen.getByRole("textbox", { name: /texto a melhorar/i }) as HTMLTextAreaElement;
    await user.clear(textBox);
    await user.type(textBox, "editado");

    act(() => {
      emit("selection:new", { text: "nova seleção", canReplace: true, warning: "" });
    });

    expect(textBox.value).toBe("nova seleção");
  });

  it("mostra o aviso mesmo quando canReplace=true (ex.: atalho ou autostart)", async () => {
    await renderAppHydrated(
      mockState({ canReplace: true, warning: "Não foi possível registrar o atalho." })
    );

    expect(screen.getByText("Não foi possível registrar o atalho.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /substituir/i })).toBeInTheDocument();
  });

  it("durante o stream Substituir/Copiar ficam desabilitados e os atalhos não disparam", async () => {
    ImproveService.Start.mockResolvedValueOnce("req-1");
    await renderAppHydrated();

    const search = screen.getByRole("combobox", { name: /buscar ação/i });
    await userEvent.setup().type(search, "Corrigir{Enter}");
    await waitFor(() => expect(ImproveService.Start).toHaveBeenCalledTimes(1));

    act(() => {
      emit("improve:chunk", { id: "req-1", delta: "parcial" });
    });
    await screen.findByDisplayValue("parcial");

    expect(screen.getByRole("button", { name: /substituir/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /copiar/i })).toBeDisabled();

    fireEvent.keyDown(window, { key: "Enter", metaKey: true });
    fireEvent.keyDown(search, { key: "Enter", ctrlKey: true });
    fireEvent.keyDown(window, { key: "C", ctrlKey: true, shiftKey: true });
    expect(ImproveService.Replace).not.toHaveBeenCalled();
    expect(ImproveService.Copy).not.toHaveBeenCalled();

    act(() => {
      emit("improve:done", { id: "req-1", text: "Final limpo." });
    });
    await screen.findByDisplayValue("Final limpo.");

    expect(screen.getByRole("button", { name: /substituir/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /copiar/i })).toBeEnabled();

    fireEvent.keyDown(window, { key: "Enter", metaKey: true });
    await waitFor(() => expect(ImproveService.Replace).toHaveBeenCalledWith("Final limpo."));
  });

  it("após um erro Substituir/Copiar continuam desabilitados", async () => {
    ImproveService.Start.mockResolvedValueOnce("req-1");
    await renderAppHydrated();

    const search = screen.getByRole("combobox", { name: /buscar ação/i });
    await userEvent.setup().type(search, "Corrigir{Enter}");
    await waitFor(() => expect(ImproveService.Start).toHaveBeenCalledTimes(1));

    act(() => {
      emit("improve:chunk", { id: "req-1", delta: "parcial" });
      emit("improve:error", { id: "req-1", message: "Caiu a conexão." });
    });
    await screen.findByText("Caiu a conexão.");

    expect(screen.getByRole("button", { name: /substituir/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /copiar/i })).toBeDisabled();
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    expect(ImproveService.Replace).not.toHaveBeenCalled();
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

  /** Runs Start + improve:done so `output`/canReplace are ready for shortcut tests. */
  async function produceOutput(text = "Resultado final.") {
    ImproveService.Start.mockResolvedValueOnce("req-1");
    const search = screen.getByRole("combobox", { name: /buscar ação/i });
    await userEvent.setup().type(search, "Corrigir{Enter}");
    await waitFor(() => expect(ImproveService.Start).toHaveBeenCalledTimes(1));
    act(() => {
      emit("improve:done", { id: "req-1", text });
    });
    await screen.findByDisplayValue(text);
  }

  describe("atalho ⌘/Ctrl+Enter — não deve iniciar um novo pedido", () => {
    it("no campo de busca de ações chama Replace uma vez e não chama Start", async () => {
      await renderAppHydrated();
      await produceOutput("Resultado final.");
      expect(ImproveService.Start).toHaveBeenCalledTimes(1);

      const search = screen.getByRole("combobox", { name: /buscar ação/i });
      search.focus();
      fireEvent.keyDown(search, { key: "Enter", ctrlKey: true });

      await waitFor(() => expect(ImproveService.Replace).toHaveBeenCalledTimes(1));
      expect(ImproveService.Replace).toHaveBeenCalledWith("Resultado final.");
      expect(ImproveService.Start).toHaveBeenCalledTimes(1);
    });

    it("no campo de instrução livre chama Replace uma vez e não chama Start", async () => {
      await renderAppHydrated();
      await produceOutput("Resultado final.");
      expect(ImproveService.Start).toHaveBeenCalledTimes(1);

      const freeInput = screen.getByRole("textbox", { name: /instrução livre/i });
      await userEvent.setup().type(freeInput, "outra instrução");
      fireEvent.keyDown(freeInput, { key: "Enter", metaKey: true });

      await waitFor(() => expect(ImproveService.Replace).toHaveBeenCalledTimes(1));
      expect(ImproveService.Replace).toHaveBeenCalledWith("Resultado final.");
      expect(ImproveService.Start).toHaveBeenCalledTimes(1);
    });

    it("Enter sem modificador no campo de instrução livre continua chamando Start (não Replace)", async () => {
      await renderAppHydrated();

      const freeInput = screen.getByRole("textbox", { name: /instrução livre/i });
      await userEvent.setup().type(freeInput, "outra instrução");
      fireEvent.keyDown(freeInput, { key: "Enter" });

      await waitFor(() =>
        expect(ImproveService.Start).toHaveBeenCalledWith({
          text: "Texto capturado de teste",
          actionId: "",
          freeInstruction: "outra instrução",
        })
      );
      expect(ImproveService.Replace).not.toHaveBeenCalled();
    });
  });

  it("uma rejeição de Replace mostra um Alert com a mensagem", async () => {
    ImproveService.Replace.mockRejectedValueOnce(new Error("Colagem automática indisponível."));
    await renderAppHydrated();
    await produceOutput("Resultado final.");

    const replaceButton = screen.getByRole("button", { name: /substituir/i });
    await userEvent.setup().click(replaceButton);

    expect(await screen.findByText("Colagem automática indisponível.")).toBeInTheDocument();
  });

  it("uma rejeição de Copy mostra um Alert e NÃO chama Close", async () => {
    ImproveService.Copy.mockRejectedValueOnce(new Error("Não foi possível copiar."));
    await renderAppHydrated();
    await produceOutput("Resultado final.");

    const copyButton = screen.getByRole("button", { name: /copiar/i });
    await userEvent.setup().click(copyButton);

    expect(await screen.findByText("Não foi possível copiar.")).toBeInTheDocument();
    expect(ImproveService.Close).not.toHaveBeenCalled();
  });

  describe("seletor de modelo", () => {
    function modelSelect() {
      return screen.getByRole("combobox", { name: "Modelo" }) as HTMLSelectElement;
    }

    it("mostra o modelo atual e os modelos instalados", async () => {
      ImproveService.ListModels.mockResolvedValue(["gpt-oss:120b-cloud", "llama3.2:latest"]);
      await renderAppHydrated();

      await waitFor(() => expect(modelSelect().options).toHaveLength(2));
      expect(modelSelect().value).toBe("llama3.2:latest");
    });

    it("mantém o modelo configurado mesmo fora da lista", async () => {
      ImproveService.ListModels.mockResolvedValue(["llama3.2:latest"]);
      await renderAppHydrated(mockState({ model: "llama3.2" }));

      await waitFor(() => expect(modelSelect().options).toHaveLength(2));
      expect(modelSelect().value).toBe("llama3.2");
    });

    it("trocar o modelo chama SetModel", async () => {
      const user = userEvent.setup();
      ImproveService.ListModels.mockResolvedValue(["llama3.2:latest", "qwen3"]);
      await renderAppHydrated();

      await waitFor(() => expect(modelSelect().options).toHaveLength(2));
      await user.selectOptions(modelSelect(), "qwen3");

      await waitFor(() => expect(ImproveService.SetModel).toHaveBeenCalledWith("qwen3"));
    });

    it("mostra o erro da listagem e mantém o modelo atual", async () => {
      ImproveService.ListModels.mockRejectedValue(
        new Error("Não foi possível conectar em http://localhost:11434/v1. O Ollama está rodando? (ollama serve)")
      );
      await renderAppHydrated();

      expect(await screen.findByText(/ollama serve/)).toBeInTheDocument();
      expect(modelSelect().value).toBe("llama3.2:latest");
    });

    it("mostra o erro quando SetModel falha", async () => {
      const user = userEvent.setup();
      ImproveService.ListModels.mockResolvedValue(["llama3.2:latest", "qwen3"]);
      ImproveService.SetModel.mockRejectedValue(new Error("Não foi possível salvar o modelo: disco cheio"));
      await renderAppHydrated();

      await waitFor(() => expect(modelSelect().options).toHaveLength(2));
      await user.selectOptions(modelSelect(), "qwen3");

      expect(await screen.findByText(/disco cheio/)).toBeInTheDocument();
    });

    it("fica desabilitado durante o stream", async () => {
      const user = userEvent.setup();
      ImproveService.ListModels.mockResolvedValue(["llama3.2:latest"]);
      await renderAppHydrated();

      const search = screen.getByRole("combobox", { name: /buscar ação/i });
      await user.click(search);
      await user.type(search, "Corrigir");
      await user.keyboard("{Enter}");
      await waitFor(() => expect(ImproveService.Start).toHaveBeenCalled());

      expect(modelSelect()).toBeDisabled();
    });

    it("atualiza o modelo com state:changed e recarrega a lista a cada seleção", async () => {
      ImproveService.ListModels.mockResolvedValue(["llama3.2:latest", "qwen3"]);
      await renderAppHydrated();
      await waitFor(() => expect(ImproveService.ListModels).toHaveBeenCalledTimes(1));

      act(() => emit("state:changed", { ...mockState(), model: "qwen3" }));
      await waitFor(() => expect(modelSelect().value).toBe("qwen3"));

      act(() => emit("selection:new", { text: "outro", canReplace: true, warning: "" }));
      await waitFor(() => expect(ImproveService.ListModels).toHaveBeenCalledTimes(2));
    });
  });
});

describe("<App /> — mascote Kraa", () => {
  beforeEach(() => {
    resetWailsMock();
    resetImproveServiceMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function poses() {
    return Array.from(document.querySelectorAll('[data-slot="mascot"]')).map((el) =>
      el.getAttribute("data-pose")
    );
  }

  async function startCorrigir() {
    const search = screen.getByRole("combobox", { name: /buscar ação/i });
    await userEvent.setup().type(search, "Corrigir{Enter}");
    await waitFor(() => expect(ImproveService.Start).toHaveBeenCalled());
  }

  it("com texto capturado e sem resultado, o preview mostra o Kraa acenando", async () => {
    await renderAppHydrated();
    expect(poses()).toEqual(["wave"]);
  });

  it("sem texto para melhorar, o preview mostra o Kraa de estado vazio", async () => {
    await renderAppHydrated(mockState({ text: "" }));
    expect(poses()).toEqual(["empty"]);
  });

  it("antes do primeiro token mostra o Kraa digitando e some quando o texto chega", async () => {
    ImproveService.Start.mockResolvedValueOnce("req-1");
    await renderAppHydrated();
    await startCorrigir();

    expect(poses()).toEqual(["typing"]);

    act(() => {
      emit("improve:chunk", { id: "req-1", delta: "Olá" });
    });
    expect(poses()).toEqual([]);

    act(() => {
      emit("improve:done", { id: "req-1", text: "Olá, limpo." });
    });
    expect(poses()).toEqual([]);
  });

  it("um erro do pedido mostra o Kraa de erro junto da mensagem, e só ele", async () => {
    ImproveService.Start.mockResolvedValueOnce("req-err");
    await renderAppHydrated();
    await startCorrigir();

    act(() => {
      emit("improve:error", {
        id: "req-err",
        message: "O Ollama está rodando? (ollama serve)",
      });
    });

    expect(poses()).toEqual(["error"]);
    const alert = screen.getByText(/ollama serve/).closest('[data-slot="alert"]')!;
    expect(alert.querySelector('[data-slot="mascot"]')).toHaveAttribute("data-pose", "error");
  });
});
