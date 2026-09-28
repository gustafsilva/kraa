import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { emit } from "../test/wailsRuntimeMock";
import { ImproveService } from "../test/improveServiceMock";
import { blurActiveElement, produceOutput, renderAppHydrated } from "./helpers";

describe("<App /> — atalhos e ações do resultado", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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

    act(blurActiveElement);
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

  it("Copiar chama Copy e depois Close", async () => {
    ImproveService.Start.mockResolvedValueOnce("req-1");
    await renderAppHydrated();

    const search = screen.getByRole("combobox", { name: /buscar ação/i });
    await userEvent.setup().type(search, "Corrigir{Enter}");
    await waitFor(() => expect(ImproveService.Start).toHaveBeenCalledTimes(1));

    act(blurActiveElement);
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

  describe("atalho ⌘/Ctrl+Enter — não deve iniciar um novo pedido", () => {
    it("no campo de busca de ações chama Replace uma vez e não chama Start", async () => {
      await renderAppHydrated();
      await produceOutput("Resultado final.");
      expect(ImproveService.Start).toHaveBeenCalledTimes(1);

      const search = screen.getByRole("combobox", { name: /buscar ação/i });
      act(() => search.focus());
      fireEvent.keyDown(search, { key: "Enter", ctrlKey: true });

      await waitFor(() => expect(ImproveService.Replace).toHaveBeenCalledTimes(1));
      expect(ImproveService.Replace).toHaveBeenCalledWith("Resultado final.");
      expect(ImproveService.Start).toHaveBeenCalledTimes(1);
    });

    it("na busca com instrução livre digitada chama Replace uma vez e não chama Start", async () => {
      await renderAppHydrated();
      await produceOutput("Resultado final.");
      expect(ImproveService.Start).toHaveBeenCalledTimes(1);

      const search = screen.getByRole("combobox", { name: /buscar ação/i });
      await userEvent.setup().type(search, "outra instrução");
      fireEvent.keyDown(search, { key: "Enter", metaKey: true });

      await waitFor(() => expect(ImproveService.Replace).toHaveBeenCalledTimes(1));
      expect(ImproveService.Replace).toHaveBeenCalledWith("Resultado final.");
      expect(ImproveService.Start).toHaveBeenCalledTimes(1);
    });

    it("Enter sem modificador na busca com instrução livre continua chamando Start (não Replace)", async () => {
      await renderAppHydrated();

      const search = screen.getByRole("combobox", { name: /buscar ação/i });
      await userEvent.setup().type(search, "outra instrução");
      fireEvent.keyDown(search, { key: "Enter" });

      await waitFor(() =>
        expect(ImproveService.Start).toHaveBeenCalledWith({
          text: "Texto capturado de teste",
          actionId: "",
          freeInstruction: "outra instrução",
          mode: "",
          previous: "",
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

  it("botão Fechar chama Close", async () => {
    await renderAppHydrated();
    await userEvent.setup().click(await screen.findByRole("button", { name: "Fechar" }));
    expect(ImproveService.Close).toHaveBeenCalled();
  });

  it("⌘⇧C copia o resultado quando há saída", async () => {
    await renderAppHydrated();
    await produceOutput("resultado");

    await userEvent.setup().keyboard("{Meta>}{Shift>}c{/Shift}{/Meta}");

    expect(ImproveService.Copy).toHaveBeenCalledWith("resultado");
  });

  it("⌘Enter com foco no preview substitui", async () => {
    await renderAppHydrated();
    await produceOutput("resultado");

    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Pré-visualização"));
    await user.keyboard("{Meta>}{Enter}{/Meta}");

    expect(ImproveService.Replace).toHaveBeenCalledWith("resultado");
  });

  it("erro de ação e erro do pedido aparecem juntos", async () => {
    ImproveService.Copy.mockRejectedValueOnce(new Error("Não foi possível copiar para a área de transferência."));
    await renderAppHydrated();
    await produceOutput("resultado"); // req-1 chega a "done".

    // A ação (Copiar) falha primeiro, enquanto o pedido ainda está "done"
    // (resultReady=true, então o botão Copiar não está desabilitado).
    await userEvent.setup().click(screen.getByRole("button", { name: /copiar/i }));
    await screen.findByText("Não foi possível copiar para a área de transferência.");

    // Um erro chega depois para o MESMO pedido (req-1). O handler de
    // improve:error só mexe em status/requestError (useImprove.ts:126), não
    // em actionError — só um novo start() limpa actionError
    // (useImprove.ts:241) — então o alerta da ação já concluída continua de
    // pé ao lado do alerta do pedido (App.tsx:190 e :209 renderizam os dois
    // independentemente). Se a ordem fosse invertida (erro do pedido antes
    // do clique em Copiar), resultReady viraria false e o botão Copiar
    // ficaria desabilitado, então o clique nunca chamaria Copy — por isso o
    // Copiar precisa vir primeiro.
    act(() => {
      emit("improve:error", { id: "req-1", message: "Falhou" });
    });
    await screen.findByText("Falhou");

    expect(screen.getAllByRole("alert")).toHaveLength(2);
  });
});
