import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Footer, type FooterProps } from "./Footer";

function renderFooter(props: Partial<FooterProps> = {}) {
  const handlers = { onReplace: vi.fn(), onCopy: vi.fn(), onBack: vi.fn() };
  const all: FooterProps = { canReplace: true, resultReady: true, focusToken: 0, ...handlers, ...props };
  const view = render(<Footer {...all} />);
  return { ...handlers, rerender: (p: Partial<FooterProps>) => view.rerender(<Footer {...all} {...p} />), user: userEvent.setup() };
}

describe("<Footer />", () => {
  it("quando o resultado fica pronto, foca Substituir", () => {
    const { rerender } = renderFooter();
    rerender({ focusToken: 1 });
    expect(screen.getByRole("button", { name: /substituir/i })).toHaveFocus();
  });

  it("sem canReplace, foca Copiar e não mostra Substituir", () => {
    const { rerender } = renderFooter({ canReplace: false });
    rerender({ focusToken: 1 });
    expect(screen.getByRole("button", { name: /copiar/i })).toHaveFocus();
    expect(screen.queryByRole("button", { name: /substituir/i })).not.toBeInTheDocument();
  });

  it("← e → alternam entre Copiar e Substituir, com volta", async () => {
    const { rerender, user } = renderFooter();
    rerender({ focusToken: 1 });
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("button", { name: /copiar/i })).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("button", { name: /substituir/i })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: /copiar/i })).toHaveFocus();
  });

  it("Enter aplica a opção focada", async () => {
    const { rerender, user, onCopy, onReplace } = renderFooter();
    rerender({ focusToken: 1 });
    await user.keyboard("{ArrowLeft}{Enter}");
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(onReplace).not.toHaveBeenCalled();
  });

  it("↑ chama onBack", async () => {
    const { rerender, user, onBack } = renderFooter();
    rerender({ focusToken: 1 });
    await user.keyboard("{ArrowUp}");
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("resultado não pronto: não rouba o foco e os botões ficam desabilitados", () => {
    const { rerender } = renderFooter({ resultReady: false });
    rerender({ focusToken: 1 });
    expect(document.body).toHaveFocus();
    expect(screen.getByRole("button", { name: /copiar/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /substituir/i })).toBeDisabled();
  });

  it("a dica muda quando o foco está na barra", () => {
    const { rerender } = renderFooter();
    expect(screen.getByText(/executar/i)).toBeInTheDocument();
    rerender({ focusToken: 1 });
    expect(screen.getByText(/aplicar/i)).toBeInTheDocument();
    expect(screen.getByText(/voltar/i)).toBeInTheDocument();
  });
});
