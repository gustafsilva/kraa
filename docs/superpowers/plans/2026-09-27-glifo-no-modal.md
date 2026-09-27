# Glifo do Kraa no cabeçalho do modal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o ícone de lápis (`PenLine`, lucide) à esquerda de "Kraa" no topo do modal
pelo glifo do corvo do Kraa, legível nos temas claro e escuro.

**Architecture:** Reusar o glifo monocromático que já alimenta a bandeja
(`docs/brand/kraa-glyph.png`, preto + alfa), reduzido para 64 px em
`frontend/src/assets/kraa-glyph.png`. No modal, ele entra como **máscara CSS** (classe
`.kraa-glyph` em `index.css`) sobre um `<span>` com `bg-foreground`: a cor vem do tema, sem
precisar de dois PNGs. Nenhuma imagem nova é gerada, a menos que a verificação visual da
Task 2 reprove o glifo a 16 px.

**Tech Stack:** React + TypeScript + Vite, Tailwind v4 (`@layer utilities` em
`frontend/src/index.css`), Vitest + Testing Library, ImageMagick (`magick`).

**Spec:** `BACKLOG.md`, seção "UI" (dois itens: trocar o lápis pelo ícone do Kraa; se
necessário, criar uma imagem específica para esse tamanho, legível no tema escuro).

## Global Constraints

- Textos da UI em PT-BR; identificadores e código em inglês (`CLAUDE.md`).
- TDD: teste falhando antes da implementação (`superpowers:test-driven-development`).
- Mudança visível ao usuário → entrada no `CHANGELOG.md` (seção `## [Não lançado]`).
- Imagens derivadas da marca são documentadas em `docs/brand/README.md` (tabela "Imagens e
  onde são usadas" e comandos de "Pós-processamento"); `docs/brand/source/` não é alterado.
- Gate de cobertura do frontend: `statements: 99, branches: 92, functions: 99, lines: 100`
  (`frontend/vitest.config.ts`). Não criar branch nova sem teste.
- Vitest roda com `css: false`: a máscara (CSS) não é verificável em teste; o teste cobre a
  estrutura do DOM e a verificação visual é manual.

## Review Focus

1. **Tema escuro** (`.dark`, aplicado por `prefers-color-scheme` em `frontend/src/view.ts`):
   o corvo tem que aparecer claro sobre o fundo escuro, não sumir. Coberto por usar
   `bg-foreground` na máscara + checagem manual da Task 2.
2. **Tema claro:** corvo escuro sobre fundo claro. Mesma solução; checagem manual na Task 2.
3. **WebKitGTK 4.1 (Ubuntu 22.04) e WKWebView antigo:** podem exigir `-webkit-mask`. A classe
   declara as duas formas (prefixada e sem prefixo).
4. **Nome acessível do cabeçalho:** o glifo é decorativo (`aria-hidden="true"`), então o texto
   continua sendo só "Kraa". Coberto pelo teste da Task 1.
5. **Nitidez em Retina:** 16 px CSS × 2 = 32 px, e o asset tem 64 px. Checagem manual na Task 2.

---

### Task 1: Glifo do Kraa no cabeçalho do modal

**Files:**
- Create: `frontend/src/assets/kraa-glyph.png` (64×64, preto + alfa, derivado de `docs/brand/kraa-glyph.png`)
- Modify: `frontend/src/index.css` (nova classe `.kraa-glyph` em `@layer utilities`, depois do bloco do mascote)
- Modify: `frontend/src/App.tsx:2` (import) e `frontend/src/App.tsx:122-125` (marca no header)
- Test: `frontend/src/app/rendering.test.tsx`
- Modify: `docs/brand/README.md` (linha 55 da tabela, bloco "Glifo da bandeja" do pós-processamento, lista "No código")
- Modify: `CHANGELOG.md` (`## [Não lançado]` → `### Alterado`)

**Interfaces:**
- Consumes: `renderAppHydrated()` de `frontend/src/app/helpers.tsx` (renderiza o `<App />` já hidratado com o mock do `ImproveService`).
- Produces: classe CSS `.kraa-glyph` e o atributo `data-slot="kraa-glyph"` no `<span>` do header (a Task 2 usa esse seletor na inspeção).

- [ ] **Step 1: Write the failing test**

Adicionar ao `describe` de `frontend/src/app/rendering.test.tsx`. Também incluir `within` no
import de `@testing-library/react` (a primeira linha passa a ser
`import { act, screen, waitFor, within } from "@testing-library/react";`):

```tsx
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend test -- src/app/rendering.test.tsx`
Expected: FAIL no novo teste (`expected null not to be null`: ainda não existe
`[data-slot="kraa-glyph"]`, só o `<svg>` do `PenLine`).

- [ ] **Step 3: Gerar o asset**

Rodar na raiz do repositório:

```bash
magick docs/brand/kraa-glyph.png -resize 64x64 -strip frontend/src/assets/kraa-glyph.png
file frontend/src/assets/kraa-glyph.png
```

Expected: `PNG image data, 64 x 64, 8-bit gray+alpha` (o mesmo processo do
`internal/trayicon/mac-template.png`).

- [ ] **Step 4: Criar a classe `.kraa-glyph`**

Em `frontend/src/index.css`, no fim do arquivo (depois do bloco `@layer utilities` do
mascote). O Vite resolve o `url()` relativo ao `index.css` e empacota o PNG:

```css
/* Kraa's crow glyph, painted with the current text color through a mask
   so it follows the light/dark theme (set the color with bg-*). */
@layer utilities {
  .kraa-glyph {
    -webkit-mask: url("./assets/kraa-glyph.png") center / contain no-repeat;
    mask: url("./assets/kraa-glyph.png") center / contain no-repeat;
  }
}
```

- [ ] **Step 5: Trocar o ícone no header**

Em `frontend/src/App.tsx`, linha 2, tirar o `PenLine` do import:

```tsx
import { RotateCcw, X } from "lucide-react";
```

Nas linhas 122–125, trocar a marca:

```tsx
          <span className="flex shrink-0 items-center gap-1.5 text-[13px] font-semibold tracking-tight">
            <span
              data-slot="kraa-glyph"
              aria-hidden="true"
              className="kraa-glyph size-4 shrink-0 bg-foreground"
            />
            Kraa
          </span>
```

O glifo passa de `size-3.5` para `size-4` (16 px, tamanho em que o glifo já foi validado na
bandeja) e de `text-pencil` para `bg-foreground`. No design, o azul `pencil` significa "texto
revisado" e não é cor da marca.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm --prefix frontend test -- src/app/rendering.test.tsx`
Expected: PASS em todos os testes do arquivo.

Depois a suíte inteira, typecheck, lint e build (o build confirma que o Vite resolveu o
`url()` da máscara):

```bash
npm --prefix frontend test
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run coverage
npm --prefix frontend run build
```

Expected: tudo verde e cobertura dentro dos thresholds. No build, o PNG (≈1–2 KB) é
embutido como data URI no CSS ou sai como `dist/assets/kraa-glyph-*.png`. As duas saídas
estão certas. Conferir com:
`grep -l "kraa-glyph\|data:image/png" frontend/dist/assets/*.css`.

- [ ] **Step 7: Documentar o asset da marca**

Em `docs/brand/README.md`, linha 55, trocar a célula "Onde é usada":

```markdown
| `kraa-glyph.png` | `source/chatgpt-tray-glyph.png` | Bandeja: `internal/trayicon/{mac-template,light,dark}.png`. Modal: glifo à esquerda de "Kraa" no cabeçalho (`frontend/src/assets/kraa-glyph.png`) |
```

Na lista "No código:" (logo depois de `mascot/*.webp`), acrescentar:

```markdown
- **App (cabeçalho do modal):** `frontend/src/assets/kraa-glyph.png` (64 px, preto + alfa),
  usado como máscara pela classe `.kraa-glyph` de `frontend/src/index.css`; a cor vem do tema.
```

No bloco de pós-processamento "Glifo da bandeja", logo depois da linha
`magick docs/brand/kraa-glyph.png -fill "#FAFAFA" ... internal/trayicon/dark.png`, acrescentar:

```bash
magick docs/brand/kraa-glyph.png -resize 64x64 -strip frontend/src/assets/kraa-glyph.png
```

- [ ] **Step 8: CHANGELOG**

Em `CHANGELOG.md`, dentro de `## [Não lançado]` → `### Alterado`, acrescentar:

```markdown
- O cabeçalho do modal mostra o corvo do Kraa no lugar do ícone de lápis, na cor do tema
  (claro ou escuro).
```

- [ ] **Step 9: Commit**

```bash
git add frontend/src/assets/kraa-glyph.png frontend/src/index.css frontend/src/App.tsx \
  frontend/src/app/rendering.test.tsx docs/brand/README.md CHANGELOG.md
git commit -m "feat(modal): glifo do Kraa no cabeçalho no lugar do lápis"
```

---

### Task 2: Verificação visual e fechamento do backlog

Esta task não cria código. Ela decide se o segundo item do backlog ("criar uma imagem
específica para esse tamanho") precisa de trabalho.

**Files:**
- Modify: `BACKLOG.md:22-23`

**Interfaces:**
- Consumes: o `<span data-slot="kraa-glyph">` da Task 1.
- Produces: nada.

- [ ] **Step 1: Subir o app**

Run: `wails3 dev`
Abrir o modal pelo atalho (`⌘⇧Y`).

- [ ] **Step 2: Conferir nos dois temas**

Em Ajustes do Sistema → Aparência, alternar Claro/Escuro com o modal aberto (o
`syncColorScheme` reage à troca). Critérios:

- Tema escuro: corvo claro e nítido sobre o fundo; o furo do olho aparece.
- Tema claro: corvo escuro e nítido.
- Alinhado verticalmente com o texto "Kraa" e com o seletor de modelo ao lado.
- A área do header continua arrastável (`--wails-draggable:drag`), inclusive sobre o glifo.

Se o furo do olho sumir ou a silhueta virar uma mancha: testar `size-5` no `App.tsx`
antes de pensar em imagem nova. Se ainda assim não ler bem, parar e abrir um item no
backlog para gerar um glifo simplificado com a skill `brand-image` (fora do escopo deste
plano).

- [ ] **Step 3: Atualizar o backlog**

Em `BACKLOG.md`, marcar os dois itens. Se a Step 2 aprovou o glifo existente:

```markdown
- [x] Modal: trocar o ícone de lápis à esquerda de "Kraa" (topo esquerdo) pelo ícone do Kraa
  - [x] Se necessário, criar uma imagem específica para esse tamanho (glifo pequeno, legível no tema escuro) — não foi necessário: o glifo da bandeja (64 px) lê bem a 16 px nos dois temas
```

Se a Step 2 reprovou, marcar só o primeiro item e deixar o subitem aberto, com a observação
do que falhou.

- [ ] **Step 4: Commit**

```bash
git add BACKLOG.md
git commit -m "docs(backlog): glifo do Kraa no cabeçalho do modal"
```
