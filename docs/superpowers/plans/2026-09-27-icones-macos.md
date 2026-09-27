# Ícones do macOS (bandeja e app) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o "W" do Wails na bandeja pelo corvo do Kraa e deixar o ícone do app legível em
tamanho pequeno (lista de Acessibilidade, Finder em lista), criando uma skill de projeto para
gerar imagens da marca pelo ChatGPT no Chrome.

**Architecture:** Três entregas independentes. (1) Skill `.claude/skills/brand-image/` com um
fluxo comum e um arquivo por provider (`providers/chatgpt.md` agora; Gemini e outros entram
depois como novos arquivos). (2) Pacote Go `internal/trayicon` com três PNG embutidos (template
monocromático do macOS, glifo escuro para tema claro, glifo claro para tema escuro), ligado ao
`main.go` no lugar de `github.com/wailsapp/wails/v3/pkg/icons`. (3) Novo ícone do app com
contraste real, aplicado nas **fontes** (`build/appicon.png` e `build/appicon.icon`), porque a
CI de release regera `icons.icns`, `Assets.car` e `icon.ico` a cada build.

**Tech Stack:** Go 1.25 (`image/png`, `embed`), Wails v3 `v3.0.0-beta.26` (`SystemTray`),
ImageMagick 7 (`magick`), `wails3 generate icons` + `actool` do Xcode, Claude in Chrome
(`mcp__claude-in-chrome__*`), ChatGPT (chatgpt.com).

**Spec:** Não há spec separada. Este plano implementa a seção **Bugs** do `BACKLOG.md` (os dois
itens de macOS) e o pedido de uma skill reutilizável para gerar imagens. O diagnóstico está na
seção "Contexto" abaixo, e o processo de marca vigente em `docs/brand/README.md`.

## Contexto (diagnóstico já feito)

- **Bandeja com "W":** `main.go:289-294` usa `icons.SystrayMacTemplate`, `icons.SystrayDark` e
  `icons.SystrayLight` do pacote `github.com/wailsapp/wails/v3/pkg/icons`, que são o logo do
  Wails. O projeto nunca teve um ícone de bandeja próprio.
- **Ícone "todo preto" na Acessibilidade:** o ícone é um corvo preto sobre squircle carvão
  (`#18181B`). Em 16–32 px o contraste some e fica um borrão escuro. No macOS 26 o sistema usa
  o `Assets.car` (`CFBundleIconName = appicon` no `build/darwin/Info.plist`), gerado do
  `build/appicon.icon` (Icon Composer: fundo sólido `#18181B`, cabeça em escala `0.62`). Ou seja,
  ainda menor e igualmente escuro.
- **A CI regera os ícones:** `.github/workflows/release.yml` roda
  `wails3 task darwin:package:universal` em `macos-latest`, que chama `common:generate:icons`
  (`build/Taskfile.yml:193-204`): `wails3 generate icons -input appicon.png ... -iconcomposerinput
  appicon.icon -macassetdir darwin`. É por isso que o working tree local tem
  `build/darwin/Assets.car` e `build/darwin/icons.icns` modificados: um build local regerou os
  dois. **Corrigir só o `.icns`/`.car` versionado não adianta; é preciso mudar as fontes.**
- **API do Wails conferida no código-fonte da versão fixada**
  (`$(go list -m -f '{{.Dir}}' github.com/wailsapp/wails/v3)/pkg/application/systemtray.go`):
  `SetIcon(icon []byte)`, `SetDarkModeIcon(icon []byte)` e `SetTemplateIcon(icon []byte)`, todos
  retornando `*SystemTray`. No macOS, `systemtray_darwin.m` faz `setSize(thickness, thickness)`
  e `setTemplate:YES`: qualquer resolução quadrada serve e, no template, só o canal alfa importa.
  Os ícones padrão do Wails são PNG 64×64.
- **O ChatGPT não entrega transparência real:** ele desenha o xadrez cinza nos pixels
  (`docs/brand/README.md`, nota sobre `chatgpt-app-icon.png`). Para glifos, peça **fundo branco
  puro** e gere o alfa localmente.

## Global Constraints

- Textos de UI, docs e mensagens de commit em **PT-BR**; identificadores e código em inglês.
- `internal/trayicon` **não importa o Wails** (só `main.go` e `internal/app` podem).
- TDD: teste primeiro, ver falhar, implementar, ver passar.
- Wails fixado em `v3.0.0-beta.26`; não mudar a versão.
- Regras do personagem (`docs/brand/README.md`): nunca estrela/brilho no bico; paleta
  `#0B0B0F`, `#18181B`, `#3F3F46`, `#FAFAFA`, `#F5B324`; âmbar só em detalhes.
- Originais gerados por IA vão para `docs/brand/source/<provider>-<nome>.png` **sem edição**;
  tudo fora de `source/` é derivado e reproduzível por comando documentado.
- Linux: `go test`/`go vet`/`go build` com `-tags gtk3`. No macOS, `go test ./...` normal.
- `go test ./...` e `npm --prefix frontend test` passam antes de cada commit.
- Não commitar `build/darwin/Assets.car` e `build/darwin/icons.icns` nas Tasks 1 e 2. Eles já
  estão modificados no working tree por um build local e só entram, regerados, na Task 3.
- Mudança visível ao usuário atualiza `CHANGELOG.md` (`## [Não lançado]` → `### Corrigido`).

## Review Focus

1. **Barra de menus clara e escura no macOS:** o ícone da bandeja precisa se adaptar sozinho.
   Isso só acontece se o template for preto + alfa (teste `TestMacTemplateIsBlackWithAlpha`, Task 2).
2. **Barra de tarefas escura do Windows e painel escuro do GNOME:** um glifo escuro some. O
   ícone para tema escuro precisa ser claro e o do tema claro, escuro (testes
   `TestLightIconIsDarkGlyph` / `TestDarkIconIsLightGlyph`, Task 2).
3. **Ícone do app em 16/32 px:** é exatamente onde o bug aparece. A prova é a folha de preview
   em fundo claro e escuro e a renderização pelo próprio macOS (`NSWorkspace`) do `.app`
   buildado (Task 3, passos de verificação).
4. **CI sobrescrevendo os ícones:** depois do commit da Task 3, rodar
   `wails3 task common:generate:icons` de novo não pode gerar diff em `build/` (Task 3, passo final).
5. **Cache de ícone / entrada antiga na Acessibilidade:** após atualizar o app, o macOS pode
   continuar mostrando o ícone antigo. A doc de solução de problemas explica como remover e
   readicionar o Kraa (Task 3, docs).

---

### Task 1: Skill `brand-image` (gerar imagens da marca via ChatGPT no Chrome)

Use a skill `superpowers:writing-skills` ao escrever estes arquivos.

**Files:**
- Create: `.claude/skills/brand-image/SKILL.md`
- Create: `.claude/skills/brand-image/providers/chatgpt.md`

**Interfaces:**
- Consumes: `docs/brand/README.md` (regras do personagem, mensagem de referência, prompts,
  pós-processamento). A skill **aponta** para ele e não duplica os prompts.
- Produces: fluxo usado pelas Tasks 2 e 3. Entrada: nome da imagem (`tray-glyph`, `app-icon-*`),
  prompt e referência opcional. Saída: arquivo bruto em `docs/brand/source/chatgpt-<nome>.png`.

- [ ] **Step 1: Criar `.claude/skills/brand-image/SKILL.md`**

```markdown
---
name: brand-image
description: Use quando precisar gerar ou editar uma imagem da marca Kraa (mascote, ícone, glifo da bandeja, ilustração do site) com um gerador de imagens por IA no navegador. Hoje usa o ChatGPT pelo Claude in Chrome.
argument-hint: "[nome-da-imagem] [descrição]"
---

# Imagens da marca Kraa

As regras do personagem, a paleta, a mensagem de referência, os prompts já usados e os comandos
de pós-processamento ficam em `docs/brand/README.md`. **Leia esse arquivo antes de gerar
qualquer imagem.** Esta skill cobre só o "como operar o gerador".

## Fluxo

1. **Defina o nome** da imagem em kebab-case (ex.: `tray-glyph`, `mascot-wave`). O original será
   salvo em `docs/brand/source/<provider>-<nome>.png`.
2. **Monte o prompt** a partir do README: comece com a mensagem de referência (chat novo) ou
   com `Next image (same Kraa crow and style, no sparkle in the beak): ...` (chat já com a
   referência). Termine com o formato (`Square 1:1.` / `wide 16:9 landscape`).
3. **Transparência:** o ChatGPT desenha o xadrez de "transparente" nos pixels. Para glifos e
   ícones que precisam de alfa exato, peça `pure flat white background (#FFFFFF), no checkerboard`
   e gere o alfa localmente com o ImageMagick. Para stickers, o fundo transparente dele costuma
   servir; confira.
4. **Escolha o provider.** Padrão: `chatgpt` → siga `providers/chatgpt.md`.
5. **Mostre o resultado ao usuário antes de aceitar.** Se vier estrela no bico, texto legível ou
   logo de terceiros, peça o ajuste no mesmo chat.
6. **Salve o original sem editar** em `docs/brand/source/`, gere os derivados com os comandos do
   README e atualize a tabela "Imagens e onde são usadas" do README (e os prompts usados, se
   forem novos).

## Providers

| Provider | Arquivo | Estado |
|---|---|---|
| ChatGPT (chatgpt.com) | `providers/chatgpt.md` | Em uso |

Para adicionar um provider (ex.: Gemini), crie `providers/<nome>.md` com as mesmas seções do
`chatgpt.md` (Pré-requisitos, Abrir o chat, Anexar referência, Enviar o prompt, Aguardar,
Baixar, Limitações conhecidas), acrescente uma linha na tabela acima e use o prefixo
`<nome>-` nos arquivos de `docs/brand/source/`.
```

- [ ] **Step 2: Criar `.claude/skills/brand-image/providers/chatgpt.md`**

```markdown
# Provider: ChatGPT (chatgpt.com) via Claude in Chrome

## Pré-requisitos

- Chrome com a extensão Claude in Chrome conectada e o usuário **logado** em chatgpt.com.
- Carregue as ferramentas numa chamada só:
  `ToolSearch("select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__find,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__file_upload")`.
- Se o site pedir login ou captcha, pare e peça ao usuário para resolver na janela do Chrome.

## Abrir o chat

1. `tabs_context_mcp` e depois `tabs_create_mcp` (aba nova; não reutilize abas do usuário).
2. `navigate` para `https://chatgpt.com/`. Para continuar um chat existente da marca, use a URL
   dele (o `docs/brand/README.md` lista os chats usados).
3. Confira o seletor de modelo: o processo documentado usa **"Instantânea"**.

## Anexar referência

- Use `file_upload` no input de arquivo do compositor com o caminho absoluto da referência
  (normalmente `docs/brand/kraa-mark.png`; para editar, o original em `docs/brand/source/`).
- Confirme por screenshot (`computer` → `screenshot`) que a miniatura apareceu antes de enviar.

## Enviar o prompt

- Clique no compositor (`find` "campo de mensagem" → `computer` `left_click`), digite o prompt
  com `computer` `type` e envie com `key` `Return`.
- **Uma imagem por mensagem.**

## Aguardar

- A geração leva de 30 s a 2 min. Tire um screenshot a cada ~20 s até a imagem final aparecer
  (sem a barra de progresso/"Criando imagem"). Não reenvie o prompt enquanto gera.

## Baixar

1. Passe o mouse sobre a imagem (ou clique para abrir em tela cheia) e clique no botão de
   download (ícone de seta para baixo).
2. O arquivo vai para `~/Downloads/` com nome parecido com `ChatGPT Image <data>.png`. Pegue o
   mais recente e mova para o destino:
   ```bash
   f=$(ls -t ~/Downloads/*.png | head -1) && echo "$f" && \
     mv "$f" docs/brand/source/chatgpt-<nome>.png
   ```
3. Mostre a imagem ao usuário (`Read` no PNG) antes de seguir para o pós-processamento.

## Limitações conhecidas

- Transparência vira xadrez desenhado nos pixels: peça fundo branco puro e recorte localmente.
- Às vezes volta a desenhar estrela no bico ou texto/logos: peça a correção no mesmo chat.
- Resolução típica: 1024×1024 (quadrado) ou 1536×1024 (paisagem).
- Os chats ficam na conta do usuário; registre a URL do chat no README se ele virar referência.
```

- [ ] **Step 3: Validar a skill**

A skill aparece em `/brand-image`? Rode `ls .claude/skills/brand-image` e confira o frontmatter
(`name`, `description`). O teste real dela é a Task 2, Step 1: se algum passo do provider
estiver errado ou faltando, corrija o `chatgpt.md` ali mesmo e inclua a correção no commit
da Task 2.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/brand-image
git commit -m "chore(claude): skill /brand-image para gerar imagens da marca pelo ChatGPT"
```

---

### Task 2: Ícone da bandeja com o corvo (`internal/trayicon`)

**Files:**
- Create: `docs/brand/source/chatgpt-tray-glyph.png` (original do ChatGPT)
- Create: `docs/brand/kraa-glyph.png` (glifo preto + alfa, 1024×1024, derivado)
- Create: `internal/trayicon/trayicon.go`
- Create: `internal/trayicon/trayicon_test.go`
- Create: `internal/trayicon/mac-template.png`, `internal/trayicon/light.png`, `internal/trayicon/dark.png`
- Modify: `main.go:17` (import) e `main.go:289-294` (ícones da bandeja)
- Modify: `docs/brand/README.md` (estrutura, tabela, prompt, pós-processamento do glifo)
- Modify: `CHANGELOG.md`, `BACKLOG.md`

**Interfaces:**
- Consumes: skill `brand-image` (Task 1).
- Produces: `trayicon.MacTemplate`, `trayicon.Light`, `trayicon.Dark` (`[]byte`, PNG 64×64).

- [ ] **Step 1: Gerar o glifo no ChatGPT (skill `brand-image`)**

Chat novo, `docs/brand/kraa-mark.png` anexada, este prompt:

```
This attached image is the Kraa crow head. Create a MENU BAR GLYPH of it: a single solid black (#000000) silhouette of the same crow head in profile facing right, the eye as a round cutout showing the white background, no inner feather lines, no gradients, no outline, no amber, no sparkle in the beak. Bold simplified shapes that stay readable at 16px, like an SF Symbol. Centered with generous padding, pure flat white background (#FFFFFF), no checkerboard. Square 1:1.
```

Salve como `docs/brand/source/chatgpt-tray-glyph.png`. Mostre ao usuário e só siga com a
aprovação dele.

**Fallback (se o ChatGPT não entregar algo bom):** derive a máscara da cabeça atual, com os
detalhes âmbar (olho e penas) virando recortes, e siga do Step 2 usando
`$TMPDIR/kraa-mask.png` no lugar da primeira linha:

```bash
magick docs/brand/kraa-mark.png -fuzz 25% -fill none -opaque "#F5B324" \
  -alpha extract -threshold 50% -negate "$TMPDIR/kraa-mask.png"
```
(A máscara sai com o glifo preto em fundo branco, o mesmo formato da imagem do ChatGPT.
Ajuste o `-fuzz` olhando o resultado.)

- [ ] **Step 2: Gerar o glifo mestre e os três PNG da bandeja**

```bash
magick docs/brand/source/chatgpt-tray-glyph.png -colorspace Gray -threshold 50% -negate \
  -trim +repage -resize 960x960 -background black -gravity center -extent 1024x1024 \
  -write mpr:mask +delete \
  -size 1024x1024 xc:black mpr:mask -alpha off -compose CopyOpacity -composite \
  -strip docs/brand/kraa-glyph.png
mkdir -p internal/trayicon
magick docs/brand/kraa-glyph.png -resize 64x64 -strip internal/trayicon/mac-template.png
magick docs/brand/kraa-glyph.png -fill "#18181B" -colorize 100 -resize 64x64 -strip internal/trayicon/light.png
magick docs/brand/kraa-glyph.png -fill "#FAFAFA" -colorize 100 -resize 64x64 -strip internal/trayicon/dark.png
```

Confira visualmente (`Read`) `internal/trayicon/light.png` e `dark.png` sobre fundo contrastante:
```bash
magick internal/trayicon/light.png -background "#ECECEC" -flatten -filter point -resize 256x256 "$TMPDIR/l.png"
magick internal/trayicon/dark.png -background "#1E1E1E" -flatten -filter point -resize 256x256 "$TMPDIR/d.png"
magick "$TMPDIR/l.png" "$TMPDIR/d.png" +append "$TMPDIR/tray-preview.png"
```
O olho precisa aparecer como furo e a silhueta ser reconhecível em 16 px.

- [ ] **Step 3: Escrever o teste que falha**

`internal/trayicon/trayicon_test.go`:

```go
package trayicon

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"testing"
)

type iconStats struct {
	width, height int
	opaque        int     // pixels com alfa > 0
	transparent   int     // pixels com alfa == 0
	maxRGB        uint8   // maior canal de cor entre os pixels visíveis
	meanLum       float64 // luminância média (0..1) dos pixels visíveis
}

func statsOf(t *testing.T, name string, data []byte) iconStats {
	t.Helper()
	img, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatalf("%s: PNG inválido: %v", name, err)
	}
	b := img.Bounds()
	s := iconStats{width: b.Dx(), height: b.Dy()}
	var lumSum float64
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			c := color.NRGBAModel.Convert(img.At(x, y)).(color.NRGBA)
			if c.A == 0 {
				s.transparent++
				continue
			}
			s.opaque++
			s.maxRGB = max(s.maxRGB, c.R, c.G, c.B)
			lumSum += (0.2126*float64(c.R) + 0.7152*float64(c.G) + 0.0722*float64(c.B)) / 255
		}
	}
	if s.opaque > 0 {
		s.meanLum = lumSum / float64(s.opaque)
	}
	return s
}

var all = map[string][]byte{"mac-template": MacTemplate, "light": Light, "dark": Dark}

func TestIconsAre64Square(t *testing.T) {
	for name, data := range all {
		s := statsOf(t, name, data)
		if s.width != 64 || s.height != 64 {
			t.Errorf("%s: %dx%d, esperado 64x64", name, s.width, s.height)
		}
	}
}

func TestIconsHaveGlyphAndTransparency(t *testing.T) {
	for name, data := range all {
		s := statsOf(t, name, data)
		total := s.width * s.height
		if s.transparent == 0 {
			t.Errorf("%s: sem pixels transparentes (fundo não recortado)", name)
		}
		if s.opaque < total/10 {
			t.Errorf("%s: glifo pequeno demais (%d de %d pixels visíveis)", name, s.opaque, total)
		}
	}
}

func TestMacTemplateIsBlackWithAlpha(t *testing.T) {
	// No macOS o template usa só o alfa; cor diferente de preto indica arte errada.
	if s := statsOf(t, "mac-template", MacTemplate); s.maxRGB > 8 {
		t.Errorf("mac-template: canal de cor até %d, esperado preto (<= 8)", s.maxRGB)
	}
}

func TestLightIconIsDarkGlyph(t *testing.T) {
	if s := statsOf(t, "light", Light); s.meanLum > 0.35 {
		t.Errorf("light: luminância média %.2f, esperado glifo escuro (<= 0.35)", s.meanLum)
	}
}

func TestDarkIconIsLightGlyph(t *testing.T) {
	if s := statsOf(t, "dark", Dark); s.meanLum < 0.65 {
		t.Errorf("dark: luminância média %.2f, esperado glifo claro (>= 0.65)", s.meanLum)
	}
}
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `go test ./internal/trayicon/`
Expected: FAIL de compilação: `undefined: MacTemplate` (e `Light`, `Dark`).

- [ ] **Step 5: Implementar o pacote**

`internal/trayicon/trayicon.go`:

```go
// Package trayicon guarda os ícones da bandeja do Kraa como PNG embutidos.
// Os arquivos são gerados a partir de docs/brand/kraa-glyph.png (ver docs/brand/README.md).
package trayicon

import _ "embed"

// MacTemplate é o glifo preto com alfa usado como template image na barra de menus do macOS
// (o sistema pinta de claro ou escuro conforme o tema).
//
//go:embed mac-template.png
var MacTemplate []byte

// Light é o glifo escuro para bandejas de tema claro (Windows/Linux).
//
//go:embed light.png
var Light []byte

// Dark é o glifo claro para bandejas de tema escuro (Windows/Linux).
//
//go:embed dark.png
var Dark []byte
```

- [ ] **Step 6: Rodar e ver passar**

Run: `go test ./internal/trayicon/ -v`
Expected: PASS nos 5 testes. Se `TestIconsHaveGlyphAndTransparency` falhar por glifo pequeno,
diminua o padding (`-resize 960x960` → `1000x1000`) no Step 2 e regenere.

- [ ] **Step 7: Ligar no `main.go`**

Trocar o import `"github.com/wailsapp/wails/v3/pkg/icons"` por
`"github.com/gustavofreitas/kraa/internal/trayicon"` e o bloco dos ícones por:

```go
	if runtime.GOOS == "darwin" {
		tray.SetTemplateIcon(trayicon.MacTemplate)
	} else {
		tray.SetDarkModeIcon(trayicon.Dark)
		tray.SetIcon(trayicon.Light)
	}
```

Run: `go build ./... && go vet ./... && go test ./...`
Expected: tudo passa; `grep -n "pkg/icons" main.go` sem resultado.

- [ ] **Step 8: Verificação manual no macOS**

`wails3 dev` (ou `wails3 task darwin:package` e abrir `bin/Kraa.app`). Conferir o corvo na
barra de menus com o tema claro e depois o escuro (Ajustes do Sistema → Aparência). O ícone
deve trocar de cor sozinho e continuar reconhecível. Tire screenshot e mostre ao usuário.

- [ ] **Step 9: Docs**

No `docs/brand/README.md`:
- Estrutura: acrescentar `kraa-glyph.png   glifo monocromático (preto + alfa), 1024×1024, base da bandeja`.
- Tabela "Imagens e onde são usadas": linha
  `| kraa-glyph.png | source/chatgpt-tray-glyph.png | Bandeja: internal/trayicon/{mac-template,light,dark}.png |`.
- Em "Prompts usados", nova subseção "Glifo da bandeja (`chatgpt-tray-glyph.png`)" com o prompt
  do Step 1.
- Em "Pós-processamento", nova subseção "Glifo da bandeja" com os comandos do Step 2 (sem os de
  preview) e o fallback do Step 1.
- Em "Processo no ChatGPT", uma linha: "A skill de projeto `/brand-image` automatiza este
  processo pelo Claude in Chrome."

`CHANGELOG.md`, em `## [Não lançado]`, criar `### Corrigido` (depois de `### Alterado`) com:
```markdown
- A bandeja mostra o corvo do Kraa em vez do ícone padrão do Wails, adaptado ao tema claro e
  escuro em macOS, Windows e Linux.
```

`BACKLOG.md`: marcar `[x]` no item do ícone da bandeja.

- [ ] **Step 10: Commit**

```bash
go test ./... && npm --prefix frontend test
git add internal/trayicon main.go docs/brand/README.md docs/brand/kraa-glyph.png \
  docs/brand/source/chatgpt-tray-glyph.png CHANGELOG.md BACKLOG.md .claude/skills/brand-image
git commit -m "fix: ícone da bandeja com o corvo do Kraa no lugar do logo do Wails"
```
(`.claude/skills/brand-image` só entra se houve correção na skill durante o Step 1.)

---

### Task 3: Ícone do app legível em tamanho pequeno

**Files:**
- Modify: `build/appicon.png`, `build/appicon.icon/icon.json`, `build/appicon.icon/Assets/*`
- Modify (regerados): `build/darwin/icons.icns`, `build/darwin/Assets.car`, `build/windows/icon.ico`
- Modify: `docs/brand/kraa-app-icon.png` e, se a opção escolhida criar arte nova, um derivado novo em `docs/brand/`
- Modify: `docs/brand/README.md` (seção "Ícone do app")
- Modify: `site/src/content/docs/ajuda/solucao-de-problemas.mdx` (ícone antigo após atualizar)
- Modify: `CHANGELOG.md`, `BACKLOG.md`

**Interfaces:**
- Consumes: `docs/brand/kraa-mark.png`; skill `brand-image` (só se a opção escolhida precisar
  de arte nova).
- Produces: fontes de ícone que a CI transforma em `.icns`/`.car`/`.ico` sem diff.

- [ ] **Step 1: Gerar três candidatos localmente**

Com `S="$TMPDIR/kraa-icon"` e `mkdir -p "$S"`. Todos usam a grade do macOS (squircle de 824 px
num canvas de 1024), e a cabeça cresce de 640 para 720 px.

A: fundo claro (off-white → zinc claro), corvo preto com olho âmbar:
```bash
magick -size 1024x1024 xc:none \
  \( -size 824x824 xc:none -fill white -draw "roundrectangle 0,0 823,823 185,185" \
     \( -size 824x824 gradient:"#FAFAFA-#D4D4D8" \) -compose SrcIn -composite \) \
  -gravity center -compose Over -composite \
  \( docs/brand/kraa-mark.png -resize 720x720 \) -gravity center -geometry +0+10 -compose Over -composite \
  -strip "$S/candidate-a.png"
```

B: fundo âmbar, corvo preto:
```bash
magick -size 1024x1024 xc:none \
  \( -size 824x824 xc:none -fill white -draw "roundrectangle 0,0 823,823 185,185" \
     \( -size 824x824 gradient:"#F8C44A-#E09A12" \) -compose SrcIn -composite \) \
  -gravity center -compose Over -composite \
  \( docs/brand/kraa-mark.png -resize 720x720 \) -gravity center -geometry +0+10 -compose Over -composite \
  -strip "$S/candidate-b.png"
```

C: fundo escuro atual, corvo com contorno off-white grosso (estilo sticker):
```bash
magick docs/brand/kraa-mark.png -resize 720x720 -bordercolor none -border 32 \
  \( +clone -alpha extract -morphology Dilate Disk:14 -background "#FAFAFA" -alpha shape \) \
  +swap -background none -layers merge +repage "$S/mark-outlined.png"
magick -size 1024x1024 xc:none \
  \( -size 824x824 xc:none -fill white -draw "roundrectangle 0,0 823,823 185,185" \
     \( -size 824x824 gradient:"#2A2A31-#121215" \) -compose SrcIn -composite \) \
  -gravity center -compose Over -composite \
  \( "$S/mark-outlined.png" -resize 740x740 \) -gravity center -geometry +0+10 -compose Over -composite \
  -strip "$S/candidate-c.png"
```

Opcional (D): pedir ao ChatGPT, pela skill `brand-image`, uma cabeça com contorno/brilho mais
forte (`docs/brand/source/chatgpt-mark-outlined.png`) e montar como a C.

- [ ] **Step 2: Folha de preview em 16/32/64/128 px, fundo claro e escuro, com o atual como referência**

```bash
cp build/appicon.png "$S/candidate-0-atual.png"
for f in "$S"/candidate-*.png; do
  n=$(basename "$f" .png); row=()
  for bg in l d; do
    [ $bg = l ] && col="#ECECEC" || col="#1E1E1E"
    for s in 16 32 64 128; do
      magick "$f" -resize ${s}x${s} -background "$col" -gravity center -extent 136x136 "$S/p-$n-$bg-$s.png"
      row+=("$S/p-$n-$bg-$s.png")
    done
  done
  magick "${row[@]}" +append "$S/row-$n.png"
done
magick "$S"/row-candidate-*.png -append "$S/icon-preview.png"
```

Mostre `$S/icon-preview.png` ao usuário (`Read`) e **peça que ele escolha** (A, B, C ou D, ou um
ajuste). Não siga sem a escolha. Critério: em 16 e 32 px, o corvo é reconhecível nos dois fundos.

- [ ] **Step 3: Aplicar a opção escolhida nas fontes**

1. `cp "$S/candidate-<X>.png" docs/brand/kraa-app-icon.png && cp docs/brand/kraa-app-icon.png build/appicon.png`
2. Camada do Icon Composer: para A e B, `build/appicon.icon/Assets/kraa-mark.png` continua igual.
   Para C, copie `"$S/mark-outlined.png"` para `docs/brand/kraa-mark-outlined.png` e
   `build/appicon.icon/Assets/kraa-mark-outlined.png`, e remova `Assets/kraa-mark.png`.
3. `build/appicon.icon/icon.json`: aumente `"scale"` de `0.62` para `0.78` e troque o fill:
   - A: `"solid" : "srgb:0.98039,0.98039,0.98039,1.00000"` (`#FAFAFA`)
   - B: `"solid" : "srgb:0.96078,0.70196,0.14118,1.00000"` (`#F5B324`)
   - C: mantém `srgb:0.09412,0.09412,0.10588,1.00000` e troca `"image-name"` para
     `"kraa-mark-outlined.png"` e `"name"` para `"kraa-mark-outlined"`.
4. Regerar: `wails3 task common:generate:icons`. Confirme que o `Assets.car` mudou
   (`git diff --stat build/darwin`). Se o `actool` falhar, siga a nota do README
   (`xcrun actool --version`, `sudo xcodebuild -runFirstLaunch`).

- [ ] **Step 4: Verificar como o macOS renderiza o `.app` buildado**

```bash
wails3 task darwin:package
cat > "$S/render.swift" <<'EOF'
import AppKit
let icon = NSWorkspace.shared.icon(forFile: CommandLine.arguments[1])
for px in [16, 32, 64] {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    icon.draw(in: NSRect(x: 0, y: 0, width: px, height: px))
    NSGraphicsContext.restoreGraphicsState()
    let out = URL(fileURLWithPath: CommandLine.arguments[2] + "-\(px).png")
    try! rep.representation(using: .png, properties: [:])!.write(to: out)
}
EOF
touch bin/Kraa.app && swift "$S/render.swift" bin/Kraa.app "$S/macos-render"
for px in 16 32 64; do magick "$S/macos-render-$px.png" -filter point -resize 192x192 "$S/r$px.png"; done
magick "$S/r16.png" "$S/r32.png" "$S/r64.png" +append "$S/macos-render.png"
```
Mostre `$S/macos-render.png` ao usuário. Deve bater com o candidato escolhido (é o que a
Acessibilidade e o Finder usam). Se aparecer o ícone antigo, é cache do LaunchServices: rode
`/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f bin/Kraa.app`
e renderize de novo.

- [ ] **Step 5: Verificação manual na Acessibilidade**

Com a aprovação do usuário (isto substitui a instalação feita pelo npm): `kraa stop`,
`rm -rf ~/Applications/Kraa.app && cp -R bin/Kraa.app ~/Applications/`, `kraa start`. Em
Ajustes do Sistema → Privacidade e Segurança → Acessibilidade, remover o Kraa com "−" e
readicionar (a assinatura ad-hoc muda a cada build). Conferir o ícone novo na lista.

- [ ] **Step 6: Docs**

`docs/brand/README.md`:
- Seção "Ícone do app" do Pós-processamento: substituir o comando antigo pelo comando da opção
  escolhida (Step 1), manter o `cp` para `build/appicon.png`, documentar o fill/scale do
  `icon.json` e trocar a chamada do `wails3 generate icons` por `wails3 task common:generate:icons`.
- Acrescentar o comando da folha de preview (Step 2) com a frase: "Todo ícone novo passa por
  esta folha: em 16 e 32 px o corvo precisa ser reconhecível nos dois fundos."
- Paleta: se a opção for A ou B, atualizar o uso de `charcoal` ("Fundo do ícone do app") e do
  `off-white`/`amber` conforme a escolha.

`site/src/content/docs/ajuda/solucao-de-problemas.mdx`: nova entrada
"O ícone do Kraa continua antigo depois de atualizar (macOS)", explicando que o macOS guarda o
ícone em cache. Para resolver: em Acessibilidade, remover o Kraa com "−" e adicionar de novo
(isso também renova a permissão); se ainda assim aparecer antigo, reiniciar o Dock com
`killall Dock`. Siga o formato das entradas vizinhas do arquivo e rode
`npm --prefix site run check`.

`CHANGELOG.md`, em `### Corrigido`:
```markdown
- Ícone do app redesenhado para continuar legível em tamanho pequeno (lista de Acessibilidade,
  Finder, Dock); antes o corvo preto sumia no fundo escuro.
```

`BACKLOG.md`: marcar `[x]` no item do ícone da Acessibilidade.

- [ ] **Step 7: Conferir que a CI não vai gerar diff e commitar**

```bash
git add build/appicon.png build/appicon.icon build/darwin/icons.icns build/darwin/Assets.car \
  build/windows/icon.ico docs/brand site/src/content/docs/ajuda/solucao-de-problemas.mdx \
  CHANGELOG.md BACKLOG.md
wails3 task common:generate:icons && git diff --stat -- build/
```
Expected: o `git diff` de `build/` vazio depois de regerar, porque o que foi staged é o que a CI
vai produzir. Se o `Assets.car` mudar a cada geração (timestamp), registre isso no README e siga
em frente, já que a CI sempre regera. Então:

```bash
go test ./... && npm --prefix frontend test
git commit -m "fix: ícone do app legível em tamanho pequeno no macOS"
```
