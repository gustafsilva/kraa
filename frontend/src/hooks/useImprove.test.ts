import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { emit } from "../test/wailsRuntimeMock";
import { ImproveService } from "../test/improveServiceMock";
import { useImprove } from "./useImprove";

describe("useImprove", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hydrates initial state from GetState on mount", async () => {
    ImproveService.GetState.mockResolvedValueOnce({
      text: "olá",
      actions: [{ id: "a1", category: "Tom", label: "Formal" }],
      canReplace: true,
      warning: "",
      error: "",
    });

    const { result } = renderHook(() => useImprove());

    await waitFor(() => expect(result.current.actions).toHaveLength(1));
    expect(result.current.text).toBe("olá");
    expect(result.current.actions[0].label).toBe("Formal");
  });

  it("resets output/status and updates text/canReplace/warning on selection:new", async () => {
    const { result } = renderHook(() => useImprove());
    await waitFor(() => expect(ImproveService.GetState).toHaveBeenCalled());

    await act(async () => {
      emit("selection:new", { text: "novo texto", canReplace: false, warning: "sem apps suportadas" });
      await Promise.resolve();
    });

    expect(result.current.text).toBe("novo texto");
    expect(result.current.canReplace).toBe(false);
    expect(result.current.warning).toBe("sem apps suportadas");
    expect(result.current.status).toBe("idle");
    expect(result.current.output).toBe("");
    expect(result.current.selectionSeq).toBe(1);
  });

  it("merges state:changed fields, including a config error", async () => {
    const { result } = renderHook(() => useImprove());
    await waitFor(() => expect(ImproveService.GetState).toHaveBeenCalled());

    act(() => {
      emit("state:changed", {
        text: "",
        actions: [],
        canReplace: false,
        warning: "",
        error: "falha ao carregar configuração",
      });
    });

    expect(result.current.configError).toBe("falha ao carregar configuração");
  });

  it("setText lets the user type into an empty modal and Start sends the typed text", async () => {
    const { result } = renderHook(() => useImprove());
    await waitFor(() => expect(ImproveService.GetState).toHaveBeenCalled());

    act(() => {
      emit("selection:new", { text: "", canReplace: true, warning: "" });
    });
    act(() => {
      result.current.setText("texto digitado");
    });
    expect(result.current.text).toBe("texto digitado");

    act(() => {
      result.current.start({ actionId: "fix" });
    });
    await waitFor(() =>
      expect(ImproveService.Start).toHaveBeenCalledWith({
        text: "texto digitado",
        actionId: "fix",
        freeInstruction: "",
      })
    );
  });

  it("state:changed does not overwrite a text the user edited", async () => {
    const { result } = renderHook(() => useImprove());
    await waitFor(() => expect(ImproveService.GetState).toHaveBeenCalled());

    await act(async () => {
      emit("selection:new", { text: "capturado", canReplace: true, warning: "" });
      await Promise.resolve();
    });
    act(() => {
      result.current.setText("capturado e editado");
    });
    act(() => {
      emit("state:changed", {
        text: "capturado",
        actions: [],
        canReplace: false,
        warning: "novo aviso",
        error: "",
      });
    });

    expect(result.current.text).toBe("capturado e editado");
    expect(result.current.warning).toBe("novo aviso");
    expect(result.current.canReplace).toBe(false);
  });

  it("a late GetState does not overwrite a text the user already edited", async () => {
    let resolveState: (s: unknown) => void = () => {};
    ImproveService.GetState.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveState = resolve;
      })
    );
    const { result } = renderHook(() => useImprove());

    act(() => {
      result.current.setText("digitado antes");
    });
    await act(async () => {
      resolveState({ text: "do backend", actions: [], canReplace: true, warning: "", error: "" });
    });

    expect(result.current.text).toBe("digitado antes");
  });

  it("selection:new replaces an edited text (it is a new capture)", async () => {
    const { result } = renderHook(() => useImprove());
    await waitFor(() => expect(ImproveService.GetState).toHaveBeenCalled());

    act(() => {
      result.current.setText("editado");
    });
    act(() => {
      emit("selection:new", { text: "nova captura", canReplace: true, warning: "" });
    });
    expect(result.current.text).toBe("nova captura");

    // After a new capture, the edit guard is reset: GetState/state:changed
    // semantics start over from the captured text.
    act(() => {
      result.current.start({ actionId: "fix" });
    });
    await waitFor(() =>
      expect(ImproveService.Start).toHaveBeenCalledWith({
        text: "nova captura",
        actionId: "fix",
        freeInstruction: "",
      })
    );
  });

  it("calls Start with the captured text and the given actionId", async () => {
    const { result } = renderHook(() => useImprove());
    await waitFor(() => expect(ImproveService.ListModels).toHaveBeenCalled());

    await act(async () => {
      emit("selection:new", { text: "texto capturado", canReplace: true, warning: "" });
      await Promise.resolve();
    });

    await act(async () => {
      result.current.start({ actionId: "fix-grammar" });
      await Promise.resolve();
    });

    expect(ImproveService.Start).toHaveBeenCalledWith({
      text: "texto capturado",
      actionId: "fix-grammar",
      freeInstruction: "",
    });
    expect(result.current.status).toBe("streaming");
  });

  it("calls Start with freeInstruction when no action is used", async () => {
    const { result } = renderHook(() => useImprove());
    await waitFor(() => expect(ImproveService.ListModels).toHaveBeenCalled());

    await act(async () => {
      emit("selection:new", { text: "texto", canReplace: true, warning: "" });
      await Promise.resolve();
    });

    await act(async () => {
      result.current.start({ freeInstruction: "deixe mais formal" });
      await Promise.resolve();
    });

    expect(ImproveService.Start).toHaveBeenCalledWith({
      text: "texto",
      actionId: "",
      freeInstruction: "deixe mais formal",
    });
  });

  it("appends improve:chunk deltas to output once the request id is known", async () => {
    ImproveService.Start.mockResolvedValueOnce("req-9");
    const { result } = renderHook(() => useImprove());

    act(() => {
      result.current.start({ actionId: "a1" });
    });
    await waitFor(() => expect(ImproveService.Start).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      emit("improve:chunk", { id: "req-9", delta: "Olá" });
      emit("improve:chunk", { id: "req-9", delta: " mundo" });
    });

    expect(result.current.output).toBe("Olá mundo");
    expect(result.current.status).toBe("streaming");
  });

  it("replaces the preview with the cleaned text on improve:done", async () => {
    ImproveService.Start.mockResolvedValueOnce("req-9");
    const { result } = renderHook(() => useImprove());

    act(() => {
      result.current.start({ actionId: "a1" });
    });
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      emit("improve:chunk", { id: "req-9", delta: "rascunho" });
      emit("improve:done", { id: "req-9", text: "Texto final limpo." });
    });

    expect(result.current.output).toBe("Texto final limpo.");
    expect(result.current.status).toBe("done");
  });

  it("surfaces improve:error as requestError and status=error", async () => {
    ImproveService.Start.mockResolvedValueOnce("req-9");
    const { result } = renderHook(() => useImprove());

    act(() => {
      result.current.start({ actionId: "a1" });
    });
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      emit("improve:error", { id: "req-9", message: "Falha ao contatar o provedor." });
    });

    expect(result.current.status).toBe("error");
    expect(result.current.requestError).toBe("Falha ao contatar o provedor.");
  });

  it("retry() re-issues the last Start request", async () => {
    ImproveService.Start.mockResolvedValueOnce("req-1").mockResolvedValueOnce("req-2");
    const { result } = renderHook(() => useImprove());

    act(() => {
      result.current.start({ actionId: "a1" });
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      emit("improve:error", { id: "req-1", message: "erro de rede" });
    });
    expect(result.current.status).toBe("error");

    act(() => {
      result.current.retry();
    });

    expect(ImproveService.Start).toHaveBeenCalledTimes(2);
    expect(ImproveService.Start).toHaveBeenLastCalledWith({
      text: "",
      actionId: "a1",
      freeInstruction: "",
    });
  });

  // R12 event-ordering/race tests moved to useImprove.race.test.ts (Task 5,
  // Step 7): this describe had grown large on its own.

  describe("Replace()/Copy() failures", () => {
    it("replace() surfaces a rejection as actionError without touching status/output", async () => {
      ImproveService.Replace.mockRejectedValueOnce(new Error("Colagem automática indisponível."));
      const { result } = renderHook(() => useImprove());

      await act(async () => {
        await result.current.replace();
      });

      expect(result.current.actionError).toBe("Colagem automática indisponível.");
    });

    it("copy() surfaces a rejection as actionError and does NOT call Close", async () => {
      ImproveService.Copy.mockRejectedValueOnce(new Error("Não foi possível copiar."));
      const { result } = renderHook(() => useImprove());

      await act(async () => {
        await result.current.copy();
      });

      expect(result.current.actionError).toBe("Não foi possível copiar.");
      expect(ImproveService.Close).not.toHaveBeenCalled();
    });

    it("a successful replace()/copy() clears any previous actionError", async () => {
      ImproveService.Replace.mockRejectedValueOnce(new Error("falhou"));
      const { result } = renderHook(() => useImprove());

      await act(async () => {
        await result.current.replace();
      });
      expect(result.current.actionError).toBe("falhou");

      ImproveService.Replace.mockResolvedValueOnce(undefined);
      await act(async () => {
        await result.current.replace();
      });
      expect(result.current.actionError).toBe("");
    });

    it("start() clears a leftover actionError from a previous Replace/Copy failure", async () => {
      ImproveService.Replace.mockRejectedValueOnce(new Error("Colagem automática indisponível."));
      const { result } = renderHook(() => useImprove());

      await act(async () => {
        await result.current.replace();
      });
      expect(result.current.actionError).toBe("Colagem automática indisponível.");

      act(() => {
        result.current.start({ actionId: "a1" });
      });

      expect(result.current.actionError).toBe("");
    });
  });

  it("copy() calls Copy then Close, in order", async () => {
    const calls: string[] = [];
    ImproveService.Copy.mockImplementationOnce(async () => {
      calls.push("copy");
    });
    ImproveService.Close.mockImplementationOnce(async () => {
      calls.push("close");
    });

    const { result } = renderHook(() => useImprove());
    act(() => {
      emit("improve:done", { id: "irrelevant", text: "" });
    });

    await act(async () => {
      await result.current.copy();
    });

    expect(calls).toEqual(["copy", "close"]);
  });

  it("close() calls Close", async () => {
    const { result } = renderHook(() => useImprove());
    await act(async () => {
      await result.current.close();
    });
    expect(ImproveService.Close).toHaveBeenCalledTimes(1);
  });

  describe("modelos", () => {
    it("setModel com sucesso atualiza o modelo e limpa modelSaving", async () => {
      const { result } = renderHook(() => useImprove());
      await waitFor(() => expect(ImproveService.ListModels).toHaveBeenCalled());
      await act(async () => {
        await result.current.setModel("fake-b");
      });
      expect(ImproveService.SetModel).toHaveBeenCalledWith("fake-b");
      expect(result.current.model).toBe("fake-b");
      expect(result.current.modelSaving).toBe(false);
      expect(result.current.modelsError).toBe("");
    });

    it("setModel com erro mostra modelsError e mantém o modelo", async () => {
      ImproveService.SetModel.mockRejectedValueOnce(new Error("Não foi possível salvar o modelo: disco cheio"));
      const { result } = renderHook(() => useImprove());
      await waitFor(() => expect(ImproveService.ListModels).toHaveBeenCalled());
      await act(async () => {
        await result.current.setModel("fake-b");
      });
      expect(result.current.modelsError).toBe("Não foi possível salvar o modelo: disco cheio");
      expect(result.current.modelSaving).toBe(false);
      expect(result.current.model).not.toBe("fake-b");
    });

    it("ListModels rejeitado deixa a lista vazia com o erro", async () => {
      ImproveService.ListModels.mockRejectedValueOnce(new Error("Não foi possível conectar"));
      const { result } = renderHook(() => useImprove());
      await waitFor(() => expect(result.current.modelsError).toBe("Não foi possível conectar"));
      expect(result.current.models).toEqual([]);
    });

    it("ListModels null vira lista vazia", async () => {
      ImproveService.ListModels.mockResolvedValueOnce(null);
      const { result } = renderHook(() => useImprove());
      await waitFor(() => expect(ImproveService.ListModels).toHaveBeenCalled());
      expect(result.current.models).toEqual([]);
    });
  });

  it("Start rejeitado vira status error com a mensagem", async () => {
    ImproveService.Start.mockRejectedValueOnce(new Error("O texto está vazio."));
    const { result } = renderHook(() => useImprove());
    await waitFor(() => expect(ImproveService.ListModels).toHaveBeenCalled());
    await act(async () => {
      result.current.start({ actionId: "a1" });
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.requestError).toBe("O texto está vazio.");
  });

  it("retry sem pedido anterior não chama Start", async () => {
    const { result } = renderHook(() => useImprove());
    await waitFor(() => expect(ImproveService.ListModels).toHaveBeenCalled());
    act(() => result.current.retry());
    expect(ImproveService.Start).not.toHaveBeenCalled();
  });

  it("setOutput edita o resultado", async () => {
    const { result } = renderHook(() => useImprove());
    await waitFor(() => expect(ImproveService.ListModels).toHaveBeenCalled());
    act(() => result.current.setOutput("editado"));
    expect(result.current.output).toBe("editado");
  });

  it("GetState rejeitado não quebra o hook", async () => {
    ImproveService.GetState.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useImprove());
    await waitFor(() => expect(ImproveService.GetState).toHaveBeenCalled());
    expect(result.current.status).toBe("idle");
  });

  it("GetState com actions null vira lista vazia", async () => {
    ImproveService.GetState.mockResolvedValueOnce({
      text: "",
      actions: null,
      canReplace: true,
      warning: "",
      error: "",
      model: "",
    });
    const { result } = renderHook(() => useImprove());
    await waitFor(() => expect(ImproveService.ListModels).toHaveBeenCalled());
    expect(result.current.actions).toEqual([]);
  });

  it("desmontar remove os listeners de eventos", async () => {
    const { unmount, result } = renderHook(() => useImprove());
    await waitFor(() => expect(ImproveService.ListModels).toHaveBeenCalled());
    unmount();
    emit("improve:chunk", { id: "req-1", text: "depois" }); // não pode lançar nem atualizar
    expect(result.current.output).toBe("");
  });

  it("selection:new com Start pendente ignora a resolução tardia (generation)", async () => {
    let resolveStart!: (id: string) => void;
    ImproveService.Start.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveStart = resolve;
        })
    );

    const { result } = renderHook(() => useImprove());
    await waitFor(() => expect(ImproveService.ListModels).toHaveBeenCalled());

    await act(async () => {
      result.current.start({ actionId: "a1" });
      await Promise.resolve();
    });

    // A new capture arrives while the Start() call above is still pending.
    await act(async () => {
      emit("selection:new", { text: "nova captura", canReplace: true, warning: "" });
      await Promise.resolve();
    });
    expect(result.current.text).toBe("nova captura");
    expect(result.current.status).toBe("idle");

    // The stale Start() finally resolves: must not resurrect the superseded
    // request's state, and must defensively cancel its own id.
    await act(async () => {
      resolveStart("req-stale");
      await Promise.resolve();
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.output).toBe("");
    expect(ImproveService.Cancel).toHaveBeenCalledWith("req-stale");

    // A live event for the now-irrelevant id must not apply either.
    act(() => {
      emit("improve:chunk", { id: "req-stale", delta: "não deveria aparecer" });
    });
    expect(result.current.output).toBe("");
  });
});
