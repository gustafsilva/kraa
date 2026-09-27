import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { emit } from "../test/wailsRuntimeMock";
import { ImproveService } from "../test/improveServiceMock";
import { blurActiveElement, mockState, renderAppHydrated } from "./helpers";

describe("<App /> — fluxo só com teclado", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function runToDone(text = "Final limpo.") {
    ImproveService.Start.mockResolvedValueOnce("req-1");
    const user = userEvent.setup();
    await renderAppHydrated();
    const search = screen.getByRole("combobox", { name: /buscar ação/i });
    await user.type(search, "Corrigir{Enter}");
    await waitFor(() => expect(ImproveService.Start).toHaveBeenCalled());
    act(() => {
      emit("improve:chunk", { id: "req-1", delta: "parcial" });
    });
    act(blurActiveElement);
    act(() => {
      emit("improve:done", { id: "req-1", text });
    });
    return { user, search };
  }

  it("quando termina, o foco vai para Substituir e Enter substitui", async () => {
    const { user } = await runToDone();
    await waitFor(() => expect(screen.getByRole("button", { name: /substituir/i })).toHaveFocus());
    await user.keyboard("{Enter}");
    await waitFor(() => expect(ImproveService.Replace).toHaveBeenCalledTimes(1));
    expect(ImproveService.Replace).toHaveBeenCalledWith("Final limpo.");
    expect(ImproveService.Start).toHaveBeenCalledTimes(1);
  });

  it("← e Enter copiam", async () => {
    const { user } = await runToDone();
    await waitFor(() => expect(screen.getByRole("button", { name: /substituir/i })).toHaveFocus());
    await user.keyboard("{ArrowLeft}{Enter}");
    await waitFor(() => expect(ImproveService.Copy).toHaveBeenCalledTimes(1));
    expect(ImproveService.Replace).not.toHaveBeenCalled();
  });

  it("↑ volta para a busca e Enter roda outra ação", async () => {
    const { user, search } = await runToDone();
    await waitFor(() => expect(screen.getByRole("button", { name: /substituir/i })).toHaveFocus());
    await user.keyboard("{ArrowUp}");
    await waitFor(() => expect(search).toHaveFocus());
    ImproveService.Start.mockResolvedValueOnce("req-2");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(ImproveService.Start).toHaveBeenCalledTimes(2));
    expect(ImproveService.Replace).not.toHaveBeenCalled();
  });

  it("não rouba o foco de quem está editando o texto", async () => {
    ImproveService.Start.mockResolvedValueOnce("req-1");
    const user = userEvent.setup();
    await renderAppHydrated();
    await user.type(screen.getByRole("combobox", { name: /buscar ação/i }), "Corrigir{Enter}");
    await waitFor(() => expect(ImproveService.Start).toHaveBeenCalled());
    const source = screen.getByRole("textbox", { name: /texto a melhorar/i });
    await user.click(source);
    act(() => {
      emit("improve:done", { id: "req-1", text: "Final limpo." });
    });
    await screen.findByDisplayValue("Final limpo.");
    expect(source).toHaveFocus();
  });

  it("quando termina com o foco ainda na busca (cmdk), o foco vai para Substituir mesmo assim", async () => {
    // Every other test in this file blurs the cmdk search before
    // improve:done (see helpers.blurActiveElement) to dodge a benign
    // cmdk/act() interaction: cmdk's own imperative blur bookkeeping isn't
    // tracked by the act() call that flips resultReady, so React logs a
    // "not wrapped in act" warning here even though the state update
    // happens synchronously inside the act() callback below. That means no
    // test was actually exercising App.tsx:100's
    // `active.closest('[data-slot="action-list"]')` branch — the real path
    // for a keyboard-only user who never left the search box (this is the
    // manual checklist's "quando o resultado termina o foco vai para
    // Substituir"). This test keeps focus in the search on purpose and
    // scopes+filters a console.error spy to just that one known message so
    // the real path stays covered without polluting the suite's warning
    // count. Removing App.tsx:100's `closest` clause makes this test fail
    // (verified manually; see task-5-report.md's "Fix round 1" section).
    const originalError = console.error;
    const consoleError = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      if (typeof args[0] === "string" && args[0].includes("not wrapped in act")) return;
      originalError(...(args as Parameters<typeof console.error>));
    });

    try {
      ImproveService.Start.mockResolvedValueOnce("req-1");
      const user = userEvent.setup();
      await renderAppHydrated();
      const search = screen.getByRole("combobox", { name: /buscar ação/i });
      await user.type(search, "Corrigir{Enter}");
      await waitFor(() => expect(ImproveService.Start).toHaveBeenCalled());
      expect(search).toHaveFocus();

      act(() => {
        emit("improve:done", { id: "req-1", text: "Final limpo." });
      });

      await waitFor(() => expect(screen.getByRole("button", { name: /substituir/i })).toHaveFocus());
    } finally {
      consoleError.mockRestore();
    }
  });

  it("sem canReplace, o foco vai para Copiar", async () => {
    ImproveService.Start.mockResolvedValueOnce("req-1");
    const user = userEvent.setup();
    await renderAppHydrated(mockState({ canReplace: false, warning: "Sem permissão." }));
    await user.type(screen.getByRole("combobox", { name: /buscar ação/i }), "Corrigir{Enter}");
    await waitFor(() => expect(ImproveService.Start).toHaveBeenCalled());
    act(blurActiveElement);
    act(() => {
      emit("improve:done", { id: "req-1", text: "Final limpo." });
    });
    await waitFor(() => expect(screen.getByRole("button", { name: /copiar/i })).toHaveFocus());
  });
});
