import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@wailsio/runtime", async () => {
  const mod = await import("../test/wailsRuntimeMock");
  return { Events: mod.Events };
});

vi.mock("@bindings/github.com/gustavofreitas/prompt-improve/internal/app", async () => {
  const mod = await import("../test/improveServiceMock");
  return { ImproveService: mod.ImproveService };
});

import { emit, resetWailsMock } from "../test/wailsRuntimeMock";
import { ImproveService, resetImproveServiceMock } from "../test/improveServiceMock";
import { ProfileWindow } from "./ProfileWindow";

async function renderLoaded(profile = { enabled: true, text: "Sou dev" }) {
  ImproveService.GetProfile.mockResolvedValueOnce(profile);
  render(<ProfileWindow />);
  await waitFor(() => expect(screen.getByLabelText("Sobre você")).toHaveValue(profile.text));
}

describe("<ProfileWindow />", () => {
  beforeEach(() => {
    resetWailsMock();
    resetImproveServiceMock();
  });

  it("carrega o perfil atual", async () => {
    await renderLoaded();
    expect(screen.getByLabelText("Usar perfil")).toBeChecked();
    expect(screen.getByText("7/2000")).toBeInTheDocument();
  });

  it("salva o que foi editado e fecha a janela", async () => {
    const user = userEvent.setup();
    await renderLoaded({ enabled: false, text: "" });

    await user.click(screen.getByLabelText("Usar perfil"));
    await user.type(screen.getByLabelText("Sobre você"), "Dev fullstack");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(ImproveService.CloseProfile).toHaveBeenCalled());
    expect(ImproveService.SaveProfile).toHaveBeenCalledWith({ enabled: true, text: "Dev fullstack" });
  });

  it("mostra o erro do backend e mantém a janela aberta", async () => {
    const user = userEvent.setup();
    ImproveService.SaveProfile.mockRejectedValueOnce(new Error("Escreva o perfil antes de ativá-lo."));
    await renderLoaded();

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Escreva o perfil antes de ativá-lo.");
    expect(ImproveService.CloseProfile).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Sobre você")).toHaveValue("Sou dev");
  });

  it("Cancelar fecha sem salvar", async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(ImproveService.CloseProfile).toHaveBeenCalled();
    expect(ImproveService.SaveProfile).not.toHaveBeenCalled();
  });

  it("profile:open descarta edições e mostra os valores atuais", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.type(screen.getByLabelText("Sobre você"), " rascunho");

    act(() => emit("profile:open", { enabled: false, text: "Editado no YAML" }));

    expect(screen.getByLabelText("Sobre você")).toHaveValue("Editado no YAML");
    expect(screen.getByLabelText("Usar perfil")).not.toBeChecked();
  });
});
