import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { emit } from "../test/wailsRuntimeMock";
import { ImproveService } from "../test/improveServiceMock";
import { blurActiveElement, renderAppHydrated } from "./helpers";

describe("<App /> — disparo de ações", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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

    const search = screen.getByRole("combobox", { name: /buscar ação/i });
    await user.type(search, "deixe mais direto{Enter}");

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

    const user = userEvent.setup();
    const search = screen.getByRole("combobox", { name: /buscar ação/i });
    await user.type(search, "melhore{Enter}");

    await waitFor(() => expect(ImproveService.Start).toHaveBeenCalled());

    act(() => {
      emit("improve:chunk", { id: "req-1", delta: "Olá" });
      emit("improve:chunk", { id: "req-1", delta: " mundo" });
    });

    const preview = screen.getByRole("textbox", { name: /pré-visualização/i }) as HTMLTextAreaElement;
    expect(preview.value).toBe("Olá mundo");
    expect(preview).toHaveAttribute("readonly");

    act(blurActiveElement);
    act(() => {
      emit("improve:done", { id: "req-1", text: "Olá mundo, limpo." });
    });

    expect(preview.value).toBe("Olá mundo, limpo.");
    expect(preview).not.toHaveAttribute("readonly");
  });
});
