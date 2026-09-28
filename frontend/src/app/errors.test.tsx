import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { emit } from "../test/wailsRuntimeMock";
import { ImproveService } from "../test/improveServiceMock";
import { mockState, renderAppHydrated } from "./helpers";

describe("<App /> — erros de configuração e de pedido", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
      mode: "",
      previous: "",
    });
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
