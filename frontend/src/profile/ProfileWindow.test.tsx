import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { emit } from "../test/wailsRuntimeMock";
import { ImproveService } from "../test/improveServiceMock";
import { ProfileWindow } from "./ProfileWindow";

async function renderLoaded(profile = { enabled: true, text: "Sou dev" }) {
  ImproveService.GetProfile.mockResolvedValueOnce(profile);
  render(<ProfileWindow />);
  await waitFor(() => expect(screen.getByLabelText("Sobre você")).toHaveValue(profile.text));
}

describe("<ProfileWindow />", () => {
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

  it("GetProfile rejeitado mostra o erro e mantém a janela utilizável", async () => {
    ImproveService.GetProfile.mockRejectedValueOnce(new Error("config ilegível"));
    render(<ProfileWindow />);
    expect(await screen.findByText(/config ilegível/)).toBeInTheDocument();
    expect(screen.getByLabelText("Sobre você")).toBeEnabled();
  });

  it("Salvar fica desabilitado enquanto salva", async () => {
    const user = userEvent.setup();
    let resolve!: () => void;
    ImproveService.SaveProfile.mockReturnValueOnce(new Promise<void>((r) => (resolve = r)));
    await renderLoaded();

    const save = screen.getByRole("button", { name: "Salvar" });
    await user.click(save);
    expect(save).toBeDisabled();

    await act(async () => resolve());
    expect(save).toBeEnabled();
  });

  it("contador mostra n/2000 e limita o texto", async () => {
    const user = userEvent.setup();
    await renderLoaded();

    const box = screen.getByRole("textbox", { name: "Sobre você" });
    await user.clear(box);
    await user.type(box, "abc");

    expect(screen.getByText("3/2000")).toBeInTheDocument();
    expect(box).toHaveAttribute("maxLength", "2000");
  });

  it("envia enabled marcado ao salvar", async () => {
    const user = userEvent.setup();
    await renderLoaded({ enabled: false, text: "Sou dev" });

    await user.click(screen.getByRole("checkbox", { name: "Usar perfil" }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(ImproveService.SaveProfile).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
  });
});

describe("<ProfileWindow /> — mascote Kraa", () => {
  it("mostra o Kraa de perfil no cabeçalho", async () => {
    await renderLoaded();
    const mascot = document.querySelector('[data-slot="mascot"]');
    expect(mascot).toHaveAttribute("data-pose", "profile");
    expect(mascot?.closest("header")).not.toBeNull();
  });
});
