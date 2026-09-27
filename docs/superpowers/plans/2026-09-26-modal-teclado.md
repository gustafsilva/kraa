# Modal em duas colunas e fluxo 100% teclado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o modal do Kraa usável só com teclado (setas + Enter do começo ao fim) e mais limpo, no layout de duas colunas da maquete do site (`site/src/components/landing/HeroDemo.tsx`), mantendo a marca (lápis azul, grafite, mascote).

**Architecture:** Só frontend (`frontend/src`). O `ActionList` vira uma lista vertical que também aceita a instrução livre (o campo separado some). O `Footer` vira uma barra de escolha "Copiar | Substituir" com foco controlado por setas. O `PreviewPane` vira um card. O `App` monta o grid de duas colunas e faz a passagem de foco: busca de ações → barra de resultado quando o stream termina → busca de novo com ↑. Nenhuma mudança em Go, bindings ou `useImprove`.

**Tech Stack:** React 18 + TypeScript, Tailwind v4, shadcn/ui (`Command` sobre `cmdk ^1.1.1`), `lucide-react`, Vitest + Testing Library + `user-event`.

**Spec:** conversa de 2026-09-26 (pedido do usuário): "ficar mais simples o uso, pra nem precisar do mouse, com teclado fácil e intuitivo, tela clean e fácil de usar (mas bonita, com nossa marca)"; referência visual: `HeroDemo.tsx` (divisão da tela, atalho para escolher como aplicar a mudança; setas + Enter para escolher).

## Fluxo de teclado (fonte da verdade)

| Onde está o foco | Tecla | Efeito |
|---|---|---|
| Busca de ações (foco inicial) | letras | filtram a lista (sem acento/maiúsculas importarem) |
| Busca | ↑ / ↓ | move a seleção na lista (com *loop*) |
| Busca | Enter | roda a ação selecionada; se o item selecionado for "Usar como instrução", roda a instrução livre com o texto digitado |
| Qualquer lugar | ⌘/Ctrl+Enter | Substituir (inalterado) |
| Qualquer lugar | ⌘/Ctrl+Shift+C | Copiar (inalterado) |
| — | stream termina (`done`) com o foco na busca ou em nenhum lugar | o foco vai para o botão padrão da barra: **Substituir** (se `canReplace`), senão **Copiar** |
| Barra de resultado | ← / → | alterna entre Copiar e Substituir (com *loop*) |
| Barra de resultado | Enter | aplica a opção focada |
| Barra de resultado | ↑ | volta o foco para a busca de ações (para rodar outra ação) |
| Qualquer lugar | Esc | fecha (inalterado, feito no Go por `RegisterKeyBinding`) |

A dica do rodapé (à esquerda) muda com o contexto:
- foco fora da barra: `↑↓ escolher · ↵ executar · esc fechar`
- foco na barra: `←→ escolher · ↵ aplicar · ↑ voltar`

## Global Constraints

- Textos de UI em **PT-BR**; identificadores e código em inglês.
- Nada de mudanças em Go, `internal/*`, bindings ou `frontend/src/hooks/useImprove.ts`.
- Marca: usar os tokens existentes de `frontend/src/index.css` — `pencil` (azul, `#2b59ff` claro / via `.dark` escuro), `pencil-wash`, `graphite`; logo `PenLine` + "Kraa" no header; mascote (`components/Mascot.tsx`). **Não** usar o roxo `brand` do site.
- Tema claro e escuro precisam funcionar (a classe `dark` é aplicada em `main.tsx`).
- Janela do modal: 560×580 (`main.go:114`); o layout tem que caber sem rolagem horizontal.
- `aria-label`s atuais que os testes usam continuam: `Buscar ação` (combobox), `Texto a melhorar`, `Pré-visualização`, botões `Substituir`/`Copiar`, `Fechar`.
- Antes de mexer em API do shadcn/cmdk, consultar a documentação via **context7** (regra do `CLAUDE.md`).
- TDD: teste falhando → implementação → teste passando.
- Verificação por task: `npm --prefix frontend test` e `npm --prefix frontend run build` passam.
- Commits: cada task comita **só os arquivos dela** (`git add <arquivos>`), mensagem em PT-BR no estilo do repo (`feat(frontend): …`), terminando com
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. As Tasks 1–3 rodam em paralelo na mesma árvore: se o `git commit` falhar com `index.lock`, espere 2 s e tente de novo.

## Review Focus

1. **Roubo de foco:** se o usuário clicou/está digitando no "Texto a melhorar" ou editando o resultado quando o stream termina, o foco **não** pode pular para a barra (Task 4 tem teste).
2. **Enter numa ação com match não pode virar instrução livre:** com texto que casa com ações, o item "Usar como instrução" fica por último e a seleção vai para a primeira ação (Task 1 tem teste).
3. **Busca só com espaços:** não mostra "Usar como instrução" e Enter não chama nada (Task 1 tem teste).
4. **Resultado não pronto (stream/erro):** ←/→/Enter na barra não fazem nada porque os botões estão desabilitados e o foco não é movido para eles (Task 2 tem teste).
5. **⌘/Ctrl+Enter na busca continua sendo Substituir** e nunca roda a ação selecionada (testes existentes em `App.test.tsx`, bloco "atalho ⌘/Ctrl+Enter", precisam continuar passando, ajustados na Task 4).

## Estrutura de arquivos

| Arquivo | Responsabilidade | Task |
|---|---|---|
| `frontend/src/components/ActionList.tsx` | Lista vertical de ações + busca + item de instrução livre, seleção controlada | 1 |
| `frontend/src/components/ActionList.test.tsx` (novo) | Testes unitários da lista | 1 |
| `frontend/src/components/Footer.tsx` | Barra "Copiar / Substituir" com foco por setas + dicas contextuais | 2 |
| `frontend/src/components/Footer.test.tsx` (novo) | Testes unitários da barra | 2 |
| `frontend/src/components/PreviewPane.tsx` | Card de resultado com selo "Escrevendo…" | 3 |
| `frontend/src/components/PreviewPane.test.tsx` (novo) | Testes unitários do card | 3 |
| `frontend/src/App.tsx` | Grid em duas colunas, remoção do campo de instrução livre, passagem de foco | 4 |
| `frontend/src/App.test.tsx` | Ajuste dos testes de instrução livre + testes do fluxo de teclado | 4 |
| `site/src/content/docs/uso/atalhos.mdx`, `uso/primeiros-passos.mdx`, `introducao.mdx`, `configuracao/acoes-customizadas.mdx`, `CHANGELOG.md`, `CLAUDE.md` | Documentação | 5 |

## Ordem de execução

- **Onda 1 (paralelo):** Tasks 1, 2, 3 (arquivos disjuntos).
- **Onda 2 (paralelo):** Task 4 (depende de 1–3) e Task 5 (só docs).
- `wails3 dev` fica rodando em background desde o início; o hot reload do Vite mostra cada onda.

---

### Task 1: ActionList vertical com instrução livre integrada

**Files:**
- Modify: `frontend/src/components/ActionList.tsx` (reescrita)
- Create: `frontend/src/components/ActionList.test.tsx`

**Interfaces:**
- Consumes: `ActionDTO` de `@bindings/github.com/gustavofreitas/kraa/internal/app` (`{ id, category, label }`).
- Produces:
  ```ts
  export interface ActionListProps {
    actions: ActionDTO[];
    onSelectAction: (actionId: string) => void;
    /** Enter on the "Usar como instrução" item: the trimmed search text. */
    onFreeInstruction: (instruction: string) => void;
    /** Bumped by the caller to (re)focus the search input. */
    focusToken?: number;
    onKeyDownCapture?: (event: React.KeyboardEvent) => void;
    className?: string;
  }
  export function ActionList(props: ActionListProps): JSX.Element;
  ```
  O elemento raiz tem `data-slot="action-list"` (a Task 4 usa isso para saber se o foco está na lista). O item de instrução livre tem o texto acessível `Usar como instrução: <texto>`.

- [ ] **Step 1: Consultar docs do cmdk** — via context7 (`/pacocoursey/cmdk`), confirmar: props `value`/`onValueChange` (seleção controlada), `shouldFilter={false}`, `loop`, e `CommandInput` com `value`/`onValueChange`.

- [ ] **Step 2: Escrever os testes falhando** em `frontend/src/components/ActionList.test.tsx`:

```tsx
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
    await user.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}{Enter}");
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
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm --prefix frontend test -- src/components/ActionList.test.tsx`
Expected: FAIL (prop `onFreeInstruction` inexistente, sem item "Usar como instrução", ordem/filtro diferentes).

- [ ] **Step 4: Implementar** — reescrever `frontend/src/components/ActionList.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { ActionDTO } from "@bindings/github.com/gustavofreitas/kraa/internal/app";

export interface ActionListProps {
  actions: ActionDTO[];
  onSelectAction: (actionId: string) => void;
  /** Enter on the "Usar como instrução" item: the trimmed search text. */
  onFreeInstruction: (instruction: string) => void;
  /** Bumped by the caller to (re)focus the search input. */
  focusToken?: number;
  /**
   * Intercepts a keydown before cmdk's own root handler sees it — used by
   * the caller to steal ⌘/Ctrl+Enter for the global "Substituir" shortcut
   * instead of letting cmdk treat it as a plain Enter.
   */
  onKeyDownCapture?: (event: React.KeyboardEvent) => void;
  className?: string;
}

const FREE_VALUE = "__free-instruction__";

function normalize(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function ActionList({
  actions,
  onSelectAction,
  onFreeInstruction,
  focusToken,
  onKeyDownCapture,
  className,
}: ActionListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const instruction = query.trim();

  // Our own filter (cmdk's fuzzy ranking would reorder the free-instruction
  // item above real matches): actions keep config order, free item goes last.
  const groups = useMemo(() => {
    const needle = normalize(instruction);
    const byCategory = new Map<string, ActionDTO[]>();
    for (const action of actions) {
      if (needle && !normalize(`${action.label} ${action.category}`).includes(needle)) continue;
      const list = byCategory.get(action.category) ?? [];
      list.push(action);
      byCategory.set(action.category, list);
    }
    return Array.from(byCategory.entries());
  }, [actions, instruction]);

  const firstValue = groups[0]?.[1][0]?.id ?? (instruction ? FREE_VALUE : "");

  // Every time the visible list changes, highlight its first item so Enter
  // always does the most obvious thing.
  useEffect(() => {
    setSelected(firstValue);
  }, [firstValue, instruction]);

  useEffect(() => {
    containerRef.current
      ?.querySelector<HTMLInputElement>('[data-slot="command-input"]')
      ?.focus();
  }, [focusToken]);

  return (
    <div
      ref={containerRef}
      data-slot="action-list"
      className={cn("flex min-h-0 flex-col [--wails-draggable:no-drag]", className)}
      onKeyDownCapture={onKeyDownCapture}
    >
      <Command
        className="min-h-0 flex-1 bg-transparent p-0"
        shouldFilter={false}
        loop
        value={selected}
        onValueChange={setSelected}
        label="Buscar ação"
      >
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Buscar ação ou instruir…"
          aria-label="Buscar ação"
          className="text-[13px]"
          wrapperClassName="p-0 *:data-[slot=input-group]:h-8! *:data-[slot=input-group]:rounded-lg! *:data-[slot=input-group]:border-transparent! *:data-[slot=input-group]:bg-transparent!"
        />
        <CommandList className="max-h-none min-h-0 flex-1 pt-1 [scrollbar-width:thin]">
          <CommandEmpty className="px-2 py-3 text-left text-[12px] text-muted-foreground">
            Digite o que deseja e aperte Enter.
          </CommandEmpty>
          {groups.map(([category, items]) => (
            <CommandGroup
              key={category}
              heading={category}
              className="p-0 **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:pt-2 **:[[cmdk-group-heading]]:pb-1 **:[[cmdk-group-heading]]:text-[10px] **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:tracking-wide **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:text-muted-foreground/80"
            >
              {items.map((action) => (
                <CommandItem
                  key={action.id}
                  value={action.id}
                  onSelect={() => onSelectAction(action.id)}
                  className="group/item justify-between rounded-md px-2 py-1.5 text-[13px] text-foreground/75 *:[svg]:hidden data-selected:bg-pencil-wash data-selected:text-foreground"
                >
                  {action.label}
                  <span aria-hidden="true" className="hidden text-pencil group-data-selected/item:inline-flex">
                    <CornerDownLeft className="size-3.5" />
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          {instruction && (
            <CommandGroup
              heading="Instrução livre"
              className="p-0 **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:pt-2 **:[[cmdk-group-heading]]:pb-1 **:[[cmdk-group-heading]]:text-[10px] **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:tracking-wide **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:text-muted-foreground/80"
            >
              <CommandItem
                value={FREE_VALUE}
                onSelect={() => onFreeInstruction(instruction)}
                className="group/item items-start gap-2 rounded-md px-2 py-1.5 text-[13px] text-foreground/75 *:[svg]:hidden data-selected:bg-pencil-wash data-selected:text-foreground"
              >
                <span aria-hidden="true" className="mt-0.5 inline-flex text-pencil">
                  <Sparkles className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1 break-words">
                  <span className="sr-only">Usar como instrução: </span>
                  <span aria-hidden="true" className="text-muted-foreground">Usar como instrução: </span>
                  {instruction}
                </span>
              </CommandItem>
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </div>
  );
}
```

  Observação: se o `toHaveTextContent("Usar como instrução: formal")` falhar pelo texto duplicado (sr-only + visível), troque os dois spans por um único `<span className="text-muted-foreground">Usar como instrução: </span>` — o objetivo é o texto do item ser exatamente `Usar como instrução: <texto>`.

- [ ] **Step 5: Rodar e ver passar**

Run: `npm --prefix frontend test -- src/components/ActionList.test.tsx`
Expected: PASS (8 testes). `App.test.tsx` vai quebrar até a Task 4 (o `App` ainda não passa `onFreeInstruction`) — isso é esperado; não mexa no `App` nesta task.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ActionList.tsx frontend/src/components/ActionList.test.tsx
git commit -m "feat(frontend): lista de ações vertical com instrução livre na busca"
```

---

### Task 2: Barra de resultado navegável por setas (Footer)

**Files:**
- Modify: `frontend/src/components/Footer.tsx` (reescrita)
- Create: `frontend/src/components/Footer.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface FooterProps {
    canReplace: boolean;
    /** True only once the cleaned result (improve:done) is available. */
    resultReady: boolean;
    onReplace: () => void;
    onCopy: () => void;
    /** Bumped by the caller when a result becomes ready: focuses the default choice. */
    focusToken?: number;
    /** ↑ from the choice buttons: go back to the action list. */
    onBack?: () => void;
  }
  export function Footer(props: FooterProps): JSX.Element;
  ```
  Botões: `Copiar` (esquerda, `variant="outline"`) e `Substituir` (direita, primário, só se `canReplace`). Grupo com `role="group"` e `aria-label="Aplicar resultado"`.

- [ ] **Step 1: Escrever os testes falhando** em `frontend/src/components/Footer.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm --prefix frontend test -- src/components/Footer.test.tsx`
Expected: FAIL (sem foco automático, sem setas, sem dicas).

- [ ] **Step 3: Implementar** — reescrever `frontend/src/components/Footer.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface FooterProps {
  canReplace: boolean;
  /** True only once the cleaned result (improve:done) is available. */
  resultReady: boolean;
  onReplace: () => void;
  onCopy: () => void;
  /** Bumped by the caller when a result becomes ready: focuses the default choice. */
  focusToken?: number;
  /** ↑ from the choice buttons: go back to the action list. */
  onBack?: () => void;
}

const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);
const mod = isMac ? "⌘" : "Ctrl";
const shift = isMac ? "⇧" : "Shift";

function Hint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <kbd>{keys}</kbd>
      {label}
    </span>
  );
}

/** Result bar: Copiar | Substituir, chosen with ←/→ and applied with Enter. */
export function Footer({ canReplace, resultReady, onReplace, onCopy, focusToken, onBack }: FooterProps) {
  // ui/button.tsx is a plain function component (no forwardRef in React 18),
  // so the choices are found through data-choice inside the group.
  const groupRef = useRef<HTMLDivElement>(null);
  const [inBar, setInBar] = useState(false);
  const choice = (name: "copy" | "replace") =>
    groupRef.current?.querySelector<HTMLButtonElement>(`button[data-choice="${name}"]`) ?? null;

  useEffect(() => {
    if (!focusToken || !resultReady) return;
    (choice(canReplace ? "replace" : "copy") ?? choice("copy"))?.focus();
    // Only a new token moves focus; canReplace/resultReady changes must not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusToken]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const target = document.activeElement === choice("copy") ? choice("replace") : choice("copy");
      target?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      onBack?.();
    }
  }

  const choiceClass =
    "group/choice h-8 gap-2 px-3 focus-visible:ring-2 focus-visible:ring-pencil/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  return (
    <footer className="flex items-center justify-between gap-2 border-t px-5 py-2.5 [--wails-draggable:no-drag]">
      <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
        {inBar ? (
          <>
            <Hint keys="←→" label="escolher" />
            <Hint keys="↵" label="aplicar" />
            <Hint keys="↑" label="voltar" />
          </>
        ) : (
          <>
            <Hint keys="↑↓" label="escolher" />
            <Hint keys="↵" label="executar" />
            <Hint keys="esc" label="fechar" />
          </>
        )}
      </span>
      <div
        ref={groupRef}
        role="group"
        aria-label="Aplicar resultado"
        className="flex items-center gap-2"
        onKeyDown={onKeyDown}
        onFocus={() => setInBar(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setInBar(false);
        }}
      >
        <Button data-choice="copy" variant="outline" onClick={onCopy} disabled={!resultReady} className={choiceClass}>
          Copiar
          <span className="flex gap-0.5 text-muted-foreground">
            <kbd>{mod}</kbd>
            <kbd>{shift}</kbd>
            <kbd>C</kbd>
          </span>
        </Button>
        {canReplace && (
          <Button
            data-choice="replace"
            onClick={onReplace}
            disabled={!resultReady}
            className={cn(choiceClass, "rounded-lg", resultReady && "shadow-[0_0_0_4px_color-mix(in_oklab,var(--pencil)_18%,transparent)]")}
          >
            Substituir
            <span className="flex gap-0.5 opacity-75">
              <kbd>{mod}</kbd>
              <kbd>↵</kbd>
            </span>
          </Button>
        )}
      </div>
    </footer>
  );
}
```

  Não altere `ui/button.tsx`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm --prefix frontend test -- src/components/Footer.test.tsx`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Footer.tsx frontend/src/components/Footer.test.tsx
git commit -m "feat(frontend): barra de resultado com escolha por setas e Enter"
```

---

### Task 3: PreviewPane como card

**Files:**
- Modify: `frontend/src/components/PreviewPane.tsx`
- Create: `frontend/src/components/PreviewPane.test.tsx`

**Interfaces:**
- Produces: mesma assinatura atual de `PreviewPane` (`value`, `onChange`, `editable`, `streaming?`, `placeholder?`, `mascot?`) — nenhuma prop nova. `aria-label="Pré-visualização"` mantido.

- [ ] **Step 1: Escrever os testes falhando** em `frontend/src/components/PreviewPane.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PreviewPane } from "./PreviewPane";

describe("<PreviewPane />", () => {
  it("é um card com título Resultado", () => {
    const { container } = render(<PreviewPane value="" onChange={vi.fn()} editable={false} />);
    expect(screen.getByText("Resultado")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="preview-card"]')).not.toBeNull();
  });

  it("mostra o selo Escrevendo… só durante o stream", () => {
    const { rerender } = render(<PreviewPane value="Olá" onChange={vi.fn()} editable={false} streaming />);
    expect(screen.getByText("Escrevendo…")).toBeInTheDocument();
    rerender(<PreviewPane value="Olá" onChange={vi.fn()} editable />);
    expect(screen.queryByText("Escrevendo…")).not.toBeInTheDocument();
  });

  it("só é editável quando editable", () => {
    const { rerender } = render(<PreviewPane value="x" onChange={vi.fn()} editable={false} />);
    expect(screen.getByRole("textbox", { name: /pré-visualização/i })).toHaveAttribute("readonly");
    rerender(<PreviewPane value="x" onChange={vi.fn()} editable />);
    expect(screen.getByRole("textbox", { name: /pré-visualização/i })).not.toHaveAttribute("readonly");
  });

  it("mostra o mascote só com o resultado vazio", () => {
    const { container, rerender } = render(<PreviewPane value="" onChange={vi.fn()} editable={false} mascot="wave" />);
    expect(container.querySelector('[data-slot="mascot"]')).not.toBeNull();
    rerender(<PreviewPane value="texto" onChange={vi.fn()} editable mascot="wave" />);
    expect(container.querySelector('[data-slot="mascot"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm --prefix frontend test -- src/components/PreviewPane.test.tsx`
Expected: FAIL (sem `data-slot="preview-card"`).

- [ ] **Step 3: Implementar** — substituir o JSX retornado em `frontend/src/components/PreviewPane.tsx` (imports: adicionar `Sparkles` de `lucide-react`; o resto do arquivo fica igual):

```tsx
  return (
    <div
      data-slot="preview-card"
      className={cn(
        "group/preview relative flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden rounded-xl border bg-card/60 py-2.5 pr-3 pl-4 transition-colors",
        (streaming || hasResult) && "border-pencil/25",
      )}
    >
      {/* Blue-pencil rule: marks the revised text, mirroring the graphite rule of the source. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-3 left-1.5 w-0.5 rounded-full transition-all group-focus-within/preview:w-[3px]",
          streaming || hasResult ? "bg-pencil" : "bg-graphite",
          streaming && "pencil-writing",
        )}
      />
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground">Resultado</span>
        {streaming && (
          <span className="inline-flex items-center gap-1 rounded-full border border-pencil/30 px-1.5 py-px text-[10px] text-pencil">
            <Sparkles className="size-3" aria-hidden="true" />
            Escrevendo…
          </span>
        )}
      </div>
      <Textarea
        className="min-h-0 flex-1 resize-none rounded-none border-0 bg-transparent p-0 text-[14px] leading-relaxed shadow-none focus-visible:ring-0 md:text-[14px] dark:bg-transparent [--wails-draggable:no-drag]"
        value={value}
        readOnly={!editable}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label="Pré-visualização"
      />
      {mascot && value.length === 0 && (
        <Mascot key={mascot} pose={mascot} size={52} className="absolute right-2 bottom-2 opacity-90" />
      )}
    </div>
  );
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm --prefix frontend test -- src/components/PreviewPane.test.tsx`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PreviewPane.tsx frontend/src/components/PreviewPane.test.tsx
git commit -m "feat(frontend): resultado em card com selo de escrita"
```

---

### Task 4: App em duas colunas e passagem de foco

**Depende de:** Tasks 1, 2 e 3 comitadas.

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: `ActionList` (`onFreeInstruction`, `focusToken`, `className`, raiz `data-slot="action-list"`) da Task 1; `Footer` (`focusToken`, `onBack`) da Task 2; `PreviewPane` sem mudança de props (Task 3); `useImprove()` sem mudança.

- [ ] **Step 1: Ajustar/adicionar testes falhando** em `frontend/src/App.test.tsx`:

  a) Nos testes que usam `screen.getByRole("textbox", { name: /instrução livre/i })` (os testes "instrução livre e Enter chamam Start com freeInstruction", "os chunks de improve:chunk aparecem no preview…", e os do bloco `describe("atalho ⌘/Ctrl+Enter …")` que usam `freeInput`), trocar o campo pela busca:
  ```tsx
  const search = screen.getByRole("combobox", { name: /buscar ação/i });
  await user.type(search, "deixe mais direto{Enter}");
  ```
  (O texto "deixe mais direto"/"melhore" não casa com nenhuma ação do mock, então o Enter vai para "Usar como instrução".) No bloco ⌘/Ctrl+Enter, o teste do `freeInput` passa a digitar na busca um texto sem match e disparar `fireEvent.keyDown(search, { key: "Enter", metaKey: true })`, esperando `Replace` (quando pronto) e nenhum `Start` novo. O teste "Enter sem modificador no campo de instrução livre continua chamando Start (não Replace)" passa a usar a busca com texto sem match e esperar `Start` com `freeInstruction`. Adicione também:
  ```tsx
  it("não existe mais o campo separado de instrução livre", async () => {
    await renderAppHydrated();
    expect(screen.queryByRole("textbox", { name: /instrução livre/i })).not.toBeInTheDocument();
  });
  ```

  b) Novo `describe("fluxo só com teclado", …)`:
  ```tsx
  describe("fluxo só com teclado", () => {
    async function runToDone(text = "Final limpo.") {
      ImproveService.Start.mockResolvedValueOnce("req-1");
      const user = userEvent.setup();
      await renderAppHydrated();
      const search = screen.getByRole("combobox", { name: /buscar ação/i });
      await user.type(search, "Corrigir{Enter}");
      await waitFor(() => expect(ImproveService.Start).toHaveBeenCalled());
      act(() => {
        emit("improve:chunk", { id: "req-1", delta: "parcial" });
        emit("improve:done", { id: "req-1", text });
      });
      return { user, search };
    }

    it("quando termina, o foco vai para Substituir e Enter substitui", async () => {
      const { user } = await runToDone();
      await waitFor(() => expect(screen.getByRole("button", { name: /substituir/i })).toHaveFocus());
      await user.keyboard("{Enter}");
      await waitFor(() => expect(ImproveService.Replace).toHaveBeenCalledTimes(1));
      expect(ImproveService.Start).toHaveBeenCalledTimes(1);
    });

    it("← e Enter copiam", async () => {
      const { user } = await runToDone();
      await waitFor(() => expect(screen.getByRole("button", { name: /substituir/i })).toHaveFocus());
      await user.keyboard("{ArrowLeft}{Enter}");
      await waitFor(() => expect(ImproveService.Copy).toHaveBeenCalledTimes(1));
      expect(ImproveService.Replace).not.toHaveBeenCalled();
    });

    it("↑ volta para a busca e Enter roda outra ação", async () => {
      const { user, search } = await runToDone();
      await waitFor(() => expect(screen.getByRole("button", { name: /substituir/i })).toHaveFocus());
      await user.keyboard("{ArrowUp}");
      await waitFor(() => expect(search).toHaveFocus());
    });

    it("não rouba o foco de quem está editando o texto", async () => {
      ImproveService.Start.mockResolvedValueOnce("req-1");
      const user = userEvent.setup();
      await renderAppHydrated();
      await user.type(screen.getByRole("combobox", { name: /buscar ação/i }), "Corrigir{Enter}");
      await waitFor(() => expect(ImproveService.Start).toHaveBeenCalled());
      const source = screen.getByRole("textbox", { name: /texto a melhorar/i });
      await user.click(source);
      act(() => {
        emit("improve:done", { id: "req-1", text: "Final limpo." });
      });
      expect(source).toHaveFocus();
    });

    it("sem canReplace, o foco vai para Copiar", async () => {
      ImproveService.Start.mockResolvedValueOnce("req-1");
      const user = userEvent.setup();
      await renderAppHydrated(mockState({ canReplace: false, warning: "Sem permissão." }));
      await user.type(screen.getByRole("combobox", { name: /buscar ação/i }), "Corrigir{Enter}");
      await waitFor(() => expect(ImproveService.Start).toHaveBeenCalled());
      act(() => {
        emit("improve:done", { id: "req-1", text: "Final limpo." });
      });
      await waitFor(() => expect(screen.getByRole("button", { name: /copiar/i })).toHaveFocus());
    });
  });
  ```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm --prefix frontend test -- src/App.test.tsx`
Expected: FAIL (campo de instrução livre ainda existe; foco não é passado).

- [ ] **Step 3: Implementar** em `frontend/src/App.tsx`:

  1. Imports: remover `Input`, `CornerDownLeft`, `Sparkles`; adicionar `useRef`.
  2. Remover o estado `freeInstruction`, a função `handleFreeInstructionKeyDown` e o bloco JSX do campo "Instrução livre" (o `div` com `Sparkles` + `Input` + `CornerDownLeft`). Atualizar o comentário de `handleReplaceShortcutCapture` para mencionar só a busca de ações.
  3. Passagem de foco (depois de `const isStreaming = …`):
  ```tsx
  // Keyboard-only flow: when a result lands and the user is still in the
  // action list (or nowhere), hand focus to the result bar so ←/→ + Enter
  // apply it. Never steal focus from someone editing the source/result.
  const [resultFocusSeq, setResultFocusSeq] = useState(0);
  const [backSeq, setBackSeq] = useState(0);
  const prevStatus = useRef(status);
  useEffect(() => {
    const becameDone = prevStatus.current !== "done" && status === "done";
    prevStatus.current = status;
    if (!becameDone || !output.trim()) return;
    const active = document.activeElement;
    if (!active || active === document.body || active.closest('[data-slot="action-list"]')) {
      setResultFocusSeq((n) => n + 1);
    }
  }, [status, output]);
  ```
  4. Corpo (substituir o `ActionList` + campo livre + `PreviewPane` atuais por):
  ```tsx
        <div className="grid min-h-0 flex-1 grid-cols-[12.5rem_1fr] gap-3">
          <ActionList
            actions={actions}
            onSelectAction={(actionId) => start({ actionId })}
            onFreeInstruction={(instruction) => start({ freeInstruction: instruction })}
            focusToken={selectionSeq + backSeq}
            onKeyDownCapture={handleReplaceShortcutCapture}
            className="rounded-xl border bg-card/40 p-1.5"
          />
          <PreviewPane
            value={output}
            onChange={setOutput}
            editable={status === "done"}
            streaming={isStreaming}
            placeholder={isStreaming ? "Gerando…" : "Escolha uma ação ou digite uma instrução."}
            mascot={previewMascot}
          />
        </div>
  ```
  5. "Texto a melhorar": manter o bloco atual (régua grafite + `Textarea`), só trocar `max-h-20` por `max-h-16` para sobrar altura para as colunas.
  6. Footer:
  ```tsx
      <Footer
        canReplace={canReplace}
        resultReady={resultReady}
        onReplace={() => void replace()}
        onCopy={() => void copy()}
        focusToken={resultFocusSeq}
        onBack={() => setBackSeq((n) => n + 1)}
      />
  ```

- [ ] **Step 4: Rodar a suíte inteira e o build**

Run: `npm --prefix frontend test && npm --prefix frontend run build`
Expected: todos os testes PASS; build sem erro de tipo.

- [ ] **Step 5: Conferir visualmente no `wails3 dev`** (já rodando): abrir o modal pelo atalho, fazer o ciclo busca → Enter → resultado → ←/→ → Enter sem mouse, em tema claro e escuro. Anotar qualquer quebra de layout em 560×580.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "feat(frontend): modal em duas colunas com fluxo só de teclado"
```

---

### Task 5: Documentação

**Files:**
- Modify: `site/src/content/docs/uso/atalhos.mdx`, `site/src/content/docs/uso/primeiros-passos.mdx:48`, `site/src/content/docs/introducao.mdx:14`, `site/src/content/docs/configuracao/acoes-customizadas.mdx:60`, `CHANGELOG.md`, `CLAUDE.md` (checklist manual)

**Interfaces:** consome o "Fluxo de teclado" do topo deste plano.

- [ ] **Step 1: `atalhos.mdx`** — substituir a tabela "Dentro do modal" por:

```mdx
## Dentro do modal

Dá para usar o Kraa inteiro sem o mouse:

| Atalho | Ação |
|---|---|
| digitar | Filtra as ações; se nada combinar, vira uma **instrução livre** |
| <Kbd keys={["↑"]} /> <Kbd keys={["↓"]} /> | Navega pela lista de ações |
| <Kbd keys={["Enter"]} /> | Executa a ação selecionada (ou a instrução livre) |
| <Kbd keys={["←"]} /> <Kbd keys={["→"]} /> | Com o resultado pronto, escolhe entre **Copiar** e **Substituir** |
| <Kbd keys={["Enter"]} /> | Aplica a opção escolhida |
| <Kbd keys={["↑"]} /> | Volta para a lista de ações para tentar outra |
| <Kbd keys={["⌘/Ctrl", "Enter"]} /> | **Substituir** direto, de qualquer lugar |
| <Kbd keys={["⌘/Ctrl", "Shift", "C"]} /> | **Copiar** direto, de qualquer lugar |
| <Kbd keys={["Esc"]} /> | Fecha o modal e cancela o stream em andamento |

Quando o resultado termina, o foco vai sozinho para **Substituir** (ou **Copiar**, se não der para
colar no app de origem): basta apertar <Kbd keys={["Enter"]} />. Se você estiver editando o texto,
o foco fica onde está.
```
  (manter o parágrafo "Substituir e Copiar só agem sobre o resultado completo…" logo abaixo.)

- [ ] **Step 2: Demais `.mdx`** — onde falam do "campo de instrução livre", trocar por "digite a instrução na busca de ações" (ex.: `primeiros-passos.mdx:48`: "Navegue com as setas e aperte Enter, ou digite o que deseja na busca: se nenhuma ação combinar, o texto vira uma instrução livre."; `acoes-customizadas.mdx:60`: "Para uso pontual, digite a instrução direto na busca do modal em vez de criar uma ação."; `introducao.mdx:14`: "… e instrução livre digitada na própria busca.").

- [ ] **Step 3: `CHANGELOG.md`** — em `## [Não lançado]`, adicionar (criando a seção `### Alterado` se não existir):

```md
### Alterado

- Modal em duas colunas (ações à esquerda, resultado à direita) e fluxo só com teclado: ↑/↓ e
  Enter escolhem a ação, ←/→ e Enter escolhem entre Copiar e Substituir, ↑ volta às ações.
- A instrução livre agora é digitada na própria busca de ações (o campo separado saiu).
```

- [ ] **Step 4: `CLAUDE.md`** — no checklist do macOS, depois de "`⌘Enter` substitui…", adicionar: "- Só teclado: digitar, ↑/↓, Enter; quando o resultado termina o foco vai para Substituir; ←/→ alterna com Copiar; Enter aplica; ↑ volta às ações." e trocar "colar/digitar no campo \"Texto a melhorar\" e escolher uma ação" se preciso (continua válido).

- [ ] **Step 5: Verificar o site**

Run: `npm --prefix site run check && npm --prefix site run build`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add site/src/content/docs CHANGELOG.md CLAUDE.md
git commit -m "docs: fluxo só de teclado e instrução livre na busca"
```

---

## Verificação final (após as duas ondas)

- `npm --prefix frontend test` e `npm --prefix frontend run build` passam.
- `go test ./...` passa (nada de Go mudou; confirma que o embed segue compilando).
- Revisão de branch inteira (`superpowers:requesting-code-review`), com atenção ao **Review Focus**.
- Checklist manual no `wails3 dev`: ciclo inteiro sem mouse, claro/escuro, `canReplace=false`, Ollama parado (erro legível, foco não vai para a barra).
