import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { emit } from "../test/wailsRuntimeMock";
import { ImproveService } from "../test/improveServiceMock";
import { useImprove } from "./useImprove";

// R12: events for a new request can arrive before the Start() promise
// resolves with its id, and overlapping start() calls can resolve out of
// order. Split out of useImprove.test.ts (Task 5) since this describe on its
// own grew large — see useImprove.ts:84-104 for the full ruling.
describe("useImprove — R12 event ordering/race with the Start id", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
