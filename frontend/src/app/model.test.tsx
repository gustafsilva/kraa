import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { emit } from "../test/wailsRuntimeMock";
import { ImproveService } from "../test/improveServiceMock";
import { mockState, renderAppHydrated } from "./helpers";

describe("<App /> — seletor de modelo", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
