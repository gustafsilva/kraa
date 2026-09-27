import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { emit } from "../test/wailsRuntimeMock";
import { ImproveService } from "../test/improveServiceMock";
import { mockState, renderAppHydrated } from "./helpers";

describe("<App /> — renderização e edição do texto", () => {
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

  it("o cabeçalho mostra o glifo do Kraa (decorativo) em vez do lápis", async () => {
    await renderAppHydrated();

    const brand = within(screen.getByRole("banner")).getByText("Kraa");
    const glyph = brand.querySelector('[data-slot="kraa-glyph"]');
    expect(glyph).not.toBeNull();
    expect(glyph).toHaveAttribute("aria-hidden", "true");
    expect(glyph).toHaveClass("kraa-glyph");
    // O lápis do lucide era um <svg>; não deve sobrar nenhum.
    expect(brand.querySelector("svg")).toBeNull();
  });

  it("não existe mais o campo separado de instrução livre", async () => {
    await renderAppHydrated();
    expect(screen.queryByRole("textbox", { name: /instrução livre/i })).not.toBeInTheDocument();
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
    // selection:new also reloads the model list; let that settle so its
    // resolution doesn't leak into (and warn in) a later test.
    await waitFor(() => expect(ImproveService.ListModels).toHaveBeenCalled());
  });

  it("mostra o aviso mesmo quando canReplace=true (ex.: atalho ou autostart)", async () => {
    await renderAppHydrated(
      mockState({ canReplace: true, warning: "Não foi possível registrar o atalho." })
    );

    expect(screen.getByText("Não foi possível registrar o atalho.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /substituir/i })).toBeInTheDocument();
  });
});
