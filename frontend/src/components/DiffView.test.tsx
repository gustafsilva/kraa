import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DiffView } from "./DiffView";

describe("<DiffView />", () => {
  it("marca palavras inseridas e removidas", () => {
    const { container } = render(<DiffView base="A reunião de amanhã caiu" text="A reunião de amanhã foi cancelada" />);
    expect(screen.getByRole("region", { name: "Mudanças" })).toBeInTheDocument();
    expect([...container.querySelectorAll("ins")].map((n) => n.textContent).join("")).toContain("cancelada");
    expect([...container.querySelectorAll("del")].map((n) => n.textContent).join("")).toContain("caiu");
  });

  it("não marca nada quando os textos são iguais", () => {
    const { container } = render(<DiffView base="Olá, mundo." text="Olá, mundo." />);
    expect(container.querySelector("ins")).toBeNull();
    expect(container.querySelector("del")).toBeNull();
    expect(container.textContent).toBe("Olá, mundo.");
  });

  it("trata palavras acentuadas como uma palavra só", () => {
    const { container } = render(<DiffView base="reunião amanhã" text="reunião hoje" />);
    expect(container.querySelector("del")?.textContent).toBe("amanhã");
    expect(container.querySelector("ins")?.textContent).toBe("hoje");
  });

  it("preserva quebras de linha", () => {
    const { container } = render(<DiffView base={"Oi,\n\nTudo bem?"} text={"Olá,\n\nTudo bem?"} />);
    expect(container.textContent).toContain("\n\nTudo bem?");
  });
});
