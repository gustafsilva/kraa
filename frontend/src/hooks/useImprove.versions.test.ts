import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { emit } from "../test/wailsRuntimeMock";
import { ImproveService } from "../test/improveServiceMock";
import { useImprove } from "./useImprove";

async function setup() {
  const hook = renderHook(() => useImprove());
  await waitFor(() => expect(ImproveService.GetState).toHaveBeenCalled());
  act(() => {
    emit("state:changed", {
      text: "",
      actions: [{ id: "formal", category: "Mensagem", label: "Mais formal" }],
      canReplace: true,
      warning: "",
      error: "",
      model: "m",
    });
    emit("selection:new", { text: "fala galera", canReplace: true, warning: "" });
  });
  return hook;
}

async function complete(fn: () => void, id: string, text: string) {
  ImproveService.Start.mockResolvedValueOnce(id);
  await act(async () => {
    fn();
  });
  await act(async () => {
    emit("improve:done", { id, text });
  });
}

async function fail(fn: () => void, id: string, message: string) {
  ImproveService.Start.mockResolvedValueOnce(id);
  await act(async () => {
    fn();
  });
  await act(async () => {
    emit("improve:chunk", { id, delta: "parcial" });
    emit("improve:error", { id, message });
  });
}

describe("useImprove — versões", () => {
  it("cada ação cria uma versão sobre o original, com o rótulo da ação", async () => {
    const { result } = await setup();
    await complete(() => result.current.start({ actionId: "formal" }), "r1", "Prezados, a reunião foi cancelada.");
    await complete(() => result.current.start({ freeInstruction: "mais curto" }), "r2", "Reunião cancelada.");

    expect(result.current.versions).toHaveLength(2);
    expect(result.current.current).toBe(1);
    expect(result.current.versions[0]).toMatchObject({ baseText: "fala galera", label: "Mais formal" });
    expect(result.current.versions[1]).toMatchObject({ baseText: "fala galera", label: "Instrução: mais curto" });
    expect(ImproveService.Start).toHaveBeenLastCalledWith({
      text: "fala galera",
      actionId: "",
      freeInstruction: "mais curto",
      mode: "",
      previous: "",
    });
    expect(result.current.output).toBe("Reunião cancelada.");
  });

  it("refine envia a versão atual editada à mão, com mode refine", async () => {
    const { result } = await setup();
    await complete(() => result.current.start({ actionId: "formal" }), "r1", "Prezados, a reunião foi cancelada.");
    act(() => result.current.setOutput("Prezados, a reunião de amanhã foi cancelada."));
    await complete(() => result.current.refine("adicione um emoji"), "r2", "Prezados, a reunião de amanhã foi cancelada. 📅");

    expect(ImproveService.Start).toHaveBeenLastCalledWith({
      text: "Prezados, a reunião de amanhã foi cancelada.",
      actionId: "",
      freeInstruction: "adicione um emoji",
      mode: "refine",
      previous: "",
    });
    expect(result.current.versions[0].text).toBe("Prezados, a reunião de amanhã foi cancelada.");
    expect(result.current.versions[1]).toMatchObject({
      baseText: "Prezados, a reunião de amanhã foi cancelada.",
      label: "Refinar: adicione um emoji",
    });
  });

  it("regenerate repete o pedido com mode variation e a versão atual em previous", async () => {
    const { result } = await setup();
    await complete(() => result.current.start({ actionId: "formal" }), "r1", "Versão A");
    await complete(() => result.current.regenerate(), "r2", "Versão B");

    expect(ImproveService.Start).toHaveBeenLastCalledWith({
      text: "fala galera",
      actionId: "formal",
      freeInstruction: "",
      mode: "variation",
      previous: "Versão A",
    });
    expect(result.current.versions[1]).toMatchObject({ text: "Versão B", baseText: "fala galera", label: "Mais formal" });
  });

  it("erro descarta a versão parcial e volta à anterior, que continua editável", async () => {
    const { result } = await setup();
    await complete(() => result.current.start({ actionId: "formal" }), "r1", "Versão A");
    await fail(() => result.current.refine("mais curto"), "r2", "Tempo esgotado aguardando o modelo. Tente novamente.");

    expect(result.current.status).toBe("error");
    expect(result.current.versions).toHaveLength(1);
    expect(result.current.current).toBe(0);
    expect(result.current.output).toBe("Versão A");
    act(() => result.current.setOutput("Versão A editada"));
    expect(result.current.versions[0].text).toBe("Versão A editada");
  });

  it("retry depois de erro repete o mesmo pedido e cria a versão com o mesmo rótulo", async () => {
    const { result } = await setup();
    await complete(() => result.current.start({ actionId: "formal" }), "r1", "Versão A");
    await fail(() => result.current.refine("mais curto"), "r2", "falhou");
    await complete(() => result.current.retry(), "r3", "Curta");

    expect(ImproveService.Start).toHaveBeenLastCalledWith(expect.objectContaining({ mode: "refine", text: "Versão A" }));
    expect(result.current.versions[1]).toMatchObject({ label: "Refinar: mais curto", baseText: "Versão A" });
  });

  it("navega entre versões e setOutput edita só a versão atual", async () => {
    const { result } = await setup();
    await complete(() => result.current.start({ actionId: "formal" }), "r1", "A");
    await complete(() => result.current.start({ actionId: "formal" }), "r2", "B");

    act(() => result.current.prevVersion());
    expect(result.current.current).toBe(0);
    expect(result.current.output).toBe("A");
    act(() => result.current.prevVersion());
    expect(result.current.current).toBe(0);
    act(() => result.current.setOutput("A2"));
    act(() => result.current.nextVersion());
    expect(result.current.output).toBe("B");
    expect(result.current.versions.map((v) => v.text)).toEqual(["A2", "B"]);
  });

  it("refine e regenerate não fazem nada sem versão ou durante o stream", async () => {
    const { result } = await setup();
    act(() => result.current.refine("x"));
    act(() => result.current.regenerate());
    expect(ImproveService.Start).not.toHaveBeenCalled();

    await complete(() => result.current.start({ actionId: "formal" }), "r1", "A");
    ImproveService.Start.mockResolvedValueOnce("r2");
    await act(async () => result.current.start({ actionId: "formal" }));
    expect(result.current.status).toBe("streaming");
    act(() => result.current.refine("x"));
    act(() => result.current.regenerate());
    expect(ImproveService.Start).toHaveBeenCalledTimes(2);
  });

  it("guarda no máximo 20 versões, descartando as mais antigas", async () => {
    const { result } = await setup();
    for (let i = 1; i <= 21; i++) {
      await complete(() => result.current.start({ actionId: "formal" }), `r${i}`, `V${i}`);
    }
    expect(result.current.versions).toHaveLength(20);
    expect(result.current.versions[0].text).toBe("V2");
    expect(result.current.current).toBe(19);
    expect(result.current.output).toBe("V21");
  });

  it("selection:new limpa as versões", async () => {
    const { result } = await setup();
    await complete(() => result.current.start({ actionId: "formal" }), "r1", "A");
    act(() => emit("selection:new", { text: "outro", canReplace: true, warning: "" }));
    expect(result.current.versions).toEqual([]);
    expect(result.current.current).toBe(-1);
    expect(result.current.currentVersion).toBeNull();
  });
});
