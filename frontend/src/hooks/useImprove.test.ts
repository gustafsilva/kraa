import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@wailsio/runtime", async () => {
  const mod = await import("../test/wailsRuntimeMock");
  return { Events: mod.Events };
});

vi.mock("@bindings/github.com/gustavofreitas/prompt-improve/internal/app", async () => {
  const mod = await import("../test/improveServiceMock");
  return { ImproveService: mod.ImproveService };
});

import { emit, resetWailsMock } from "../test/wailsRuntimeMock";
import { ImproveService } from "../test/improveServiceMock";
import { resetImproveServiceMock } from "../test/improveServiceMock";
import { useImprove } from "./useImprove";

describe("useImprove", () => {
  beforeEach(() => {
    resetWailsMock();
    resetImproveServiceMock();
  });

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

    act(() => {
      emit("selection:new", { text: "novo texto", canReplace: false, warning: "sem apps suportadas" });
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

    act(() => {
      emit("selection:new", { text: "capturado", canReplace: true, warning: "" });
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
    act(() => {
      emit("selection:new", { text: "texto capturado", canReplace: true, warning: "" });
    });

    act(() => {
      result.current.start({ actionId: "fix-grammar" });
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
    act(() => {
      emit("selection:new", { text: "texto", canReplace: true, warning: "" });
    });

    act(() => {
      result.current.start({ freeInstruction: "deixe mais formal" });
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

  describe("R12 — event ordering/race with the Start id", () => {
    it("buffers events that arrive before Start resolves, then replays them for the resolved id", async () => {
      let resolveStart!: (id: string) => void;
      ImproveService.Start.mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveStart = resolve;
          })
      );

      const { result } = renderHook(() => useImprove());
      act(() => {
        result.current.start({ actionId: "a1" });
      });

      // Events for the not-yet-known id arrive first (server race).
      act(() => {
        emit("improve:chunk", { id: "req-42", delta: "primeiro" });
        emit("improve:chunk", { id: "req-42", delta: " segundo" });
      });
      // Nothing applied yet — the id is still unknown.
      expect(result.current.output).toBe("");

      await act(async () => {
        resolveStart("req-42");
        await Promise.resolve();
      });

      expect(result.current.output).toBe("primeiro segundo");
    });

    it("drops buffered events for an id other than the one Start resolved with", async () => {
      let resolveStart!: (id: string) => void;
      ImproveService.Start.mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveStart = resolve;
          })
      );

      const { result } = renderHook(() => useImprove());
      act(() => {
        result.current.start({ actionId: "a1" });
      });

      // A straggler from a previous, already-superseded request.
      act(() => {
        emit("improve:chunk", { id: "req-old", delta: "não deveria aparecer" });
      });

      await act(async () => {
        resolveStart("req-new");
        await Promise.resolve();
      });

      expect(result.current.output).toBe("");
      expect(result.current.status).toBe("streaming");
    });

    it("ignores live events whose id no longer matches the current request", async () => {
      ImproveService.Start.mockResolvedValueOnce("req-current");
      const { result } = renderHook(() => useImprove());

      act(() => {
        result.current.start({ actionId: "a1" });
      });
      await act(async () => {
        await Promise.resolve();
      });

      act(() => {
        emit("improve:chunk", { id: "req-stale", delta: "ignorado" });
      });

      expect(result.current.output).toBe("");
    });

    it("keeps the latest overlapping start()'s state when the OLDER Start resolves first", async () => {
      let resolveReq1!: (id: string) => void;
      let resolveReq2!: (id: string) => void;
      ImproveService.Start.mockImplementationOnce(
        () => new Promise<string>((resolve) => { resolveReq1 = resolve; })
      ).mockImplementationOnce(
        () => new Promise<string>((resolve) => { resolveReq2 = resolve; })
      );

      const { result } = renderHook(() => useImprove());

      // Two overlapping start() calls before either Start() promise settles.
      act(() => {
        result.current.start({ actionId: "a1" });
      });
      act(() => {
        result.current.start({ actionId: "a2" });
      });

      // Events for both ids arrive while both requests are still pending.
      act(() => {
        emit("improve:chunk", { id: "req-old", delta: "velho" });
        emit("improve:chunk", { id: "req-new", delta: "novo" });
      });

      // req1 (the OLDER start() call) resolves first — this must be a no-op
      // for local state (it's stale) beyond defensively cancelling itself.
      await act(async () => {
        resolveReq1("req-old");
        await Promise.resolve();
      });
      expect(result.current.output).toBe("");
      expect(ImproveService.Cancel).toHaveBeenCalledWith("req-old");
      expect(ImproveService.Cancel).not.toHaveBeenCalledWith("req-new");

      // req2 (the LATEST start() call) resolves next — its buffered chunk
      // must be applied, and req1's buffered chunk must stay dropped.
      await act(async () => {
        resolveReq2("req-new");
        await Promise.resolve();
      });
      expect(result.current.output).toBe("novo");

      // A further live event for the superseded id is still ignored.
      act(() => {
        emit("improve:chunk", { id: "req-old", delta: " mais velho" });
      });
      expect(result.current.output).toBe("novo");

      act(() => {
        emit("improve:done", { id: "req-new", text: "novo final" });
      });
      expect(result.current.output).toBe("novo final");
      expect(result.current.status).toBe("done");
    });

    it("keeps the latest overlapping start()'s state when the NEWER Start resolves first", async () => {
      let resolveReq1!: (id: string) => void;
      let resolveReq2!: (id: string) => void;
      ImproveService.Start.mockImplementationOnce(
        () => new Promise<string>((resolve) => { resolveReq1 = resolve; })
      ).mockImplementationOnce(
        () => new Promise<string>((resolve) => { resolveReq2 = resolve; })
      );

      const { result } = renderHook(() => useImprove());

      act(() => {
        result.current.start({ actionId: "a1" });
      });
      act(() => {
        result.current.start({ actionId: "a2" });
      });

      act(() => {
        emit("improve:chunk", { id: "req-new", delta: "novo" });
      });

      // req2 (the LATEST start() call) resolves FIRST this time.
      await act(async () => {
        resolveReq2("req-new");
        await Promise.resolve();
      });
      expect(result.current.output).toBe("novo");

      // req1 (the OLDER call) resolves afterwards — must not clobber the
      // current id/output, and must defensively cancel its own id.
      await act(async () => {
        resolveReq1("req-old");
        await Promise.resolve();
      });
      expect(result.current.output).toBe("novo");
      expect(ImproveService.Cancel).toHaveBeenCalledWith("req-old");

      // Live events for req-old (now doubly stale) are ignored; req-new's
      // still apply normally.
      act(() => {
        emit("improve:chunk", { id: "req-old", delta: "ignorar" });
        emit("improve:chunk", { id: "req-new", delta: " mundo" });
      });
      expect(result.current.output).toBe("novo mundo");
    });
  });

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
});
