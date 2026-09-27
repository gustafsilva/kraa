import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ActionList } from "./ActionList";

const actions = [
  { id: "a1", category: "Tom", label: "Deixar formal" },
  { id: "a2", category: "Tom", label: "Deixar casual" },
  { id: "b1", category: "Gramática", label: "Corrigir erros" },
];

function setup() {
  const onSelectAction = vi.fn();
  const onFreeInstruction = vi.fn();
  render(
    <ActionList actions={actions} onSelectAction={onSelectAction} onFreeInstruction={onFreeInstruction} focusToken={1} />,
  );
  const search = screen.getByRole("combobox", { name: /buscar ação/i });
  return { onSelectAction, onFreeInstruction, search, user: userEvent.setup() };
}

describe("<ActionList />", () => {
  it("lista as ações em ordem, com as categorias como cabeçalho", () => {
    setup();
    expect(screen.getByText("Tom")).toBeInTheDocument();
    expect(screen.getByText("Gramática")).toBeInTheDocument();
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Deixar formal",
      "Deixar casual",
      "Corrigir erros",
    ]);
  });

  it("foca a busca e Enter roda a primeira ação", async () => {
    const { search, user, onSelectAction } = setup();
    expect(search).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onSelectAction).toHaveBeenCalledWith("a1");
  });

  it("↓ e Enter rodam a segunda ação; ↑ na primeira dá a volta para a última", async () => {
    const { user, onSelectAction } = setup();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onSelectAction).toHaveBeenLastCalledWith("a2");
    // a2 → a1 (first) → b1 (wraps to the last).
    await user.keyboard("{ArrowUp}{ArrowUp}{Enter}");
    expect(onSelectAction).toHaveBeenLastCalledWith("b1");
  });

  it("filtra sem diferenciar acento e maiúsculas", async () => {
    const { user } = setup();
    await user.keyboard("GRAMATICA");
    const labels = screen.getAllByRole("option").map((o) => o.textContent);
    expect(labels[0]).toBe("Corrigir erros");
    expect(labels).not.toContain("Deixar formal");
  });

  it("com match, Enter roda a ação e 'Usar como instrução' fica por último", async () => {
    const { user, onSelectAction, onFreeInstruction } = setup();
    await user.keyboard("formal");
    const options = screen.getAllByRole("option");
    expect(options.at(-1)).toHaveTextContent("Usar como instrução: formal");
    await user.keyboard("{Enter}");
    expect(onSelectAction).toHaveBeenCalledWith("a1");
    expect(onFreeInstruction).not.toHaveBeenCalled();
  });

  it("sem match, Enter envia o texto digitado como instrução livre", async () => {
    const { user, onSelectAction, onFreeInstruction } = setup();
    await user.keyboard("  deixe mais direto  ");
    await user.keyboard("{Enter}");
    expect(onFreeInstruction).toHaveBeenCalledWith("deixe mais direto");
    expect(onSelectAction).not.toHaveBeenCalled();
  });

  it("busca só com espaços não oferece instrução livre", async () => {
    const { user, onFreeInstruction } = setup();
    await user.keyboard("   ");
    expect(screen.queryByText(/usar como instrução/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(onFreeInstruction).not.toHaveBeenCalled();
  });

  it("sem ações e sem texto mostra a dica de instrução livre", () => {
    render(<ActionList actions={[]} onSelectAction={vi.fn()} onFreeInstruction={vi.fn()} />);
    expect(screen.getByText(/digite o que deseja e aperte enter/i)).toBeInTheDocument();
  });
});
