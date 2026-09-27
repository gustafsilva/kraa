import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { emit } from "../test/wailsRuntimeMock";
import { ImproveService } from "../test/improveServiceMock";
import { blurActiveElement, mockState, renderAppHydrated } from "./helpers";

describe("<App /> — mascote Kraa", () => {
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

    act(blurActiveElement);
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
