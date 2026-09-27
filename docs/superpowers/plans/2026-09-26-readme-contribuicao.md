# README e contribuição — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** README focado em instalar e usar, CONTRIBUTING focado na primeira contribuição,
templates, labels e issues iniciais no GitHub, e um GIF de demonstração feito a partir de uma
gravação real.

**Architecture:** Documentação dividida por papel: README (vitrine e uso), `CONTRIBUTING.md`
(processo) e site `site/src/content/docs/contribuir/` (parte técnica). As mudanças no GitHub
(labels, repositório, Discussions, issues) são aplicadas via `gh` só depois da aprovação do
mantenedor.

**Tech Stack:** Markdown/MDX (Astro), YAML de issue forms do GitHub, `gh` CLI, ffmpeg 8 +
ImageMagick 7 (Homebrew), Node (para validar YAML com `site/node_modules/yaml`).

**Spec:** `docs/superpowers/specs/2026-09-26-readme-contribuicao-design.md`

## Global Constraints

- Todo texto voltado a pessoas (README, CONTRIBUTING, templates, labels, issues) fica em
  **PT-BR** com acentuação correta. Identificadores, comandos e caminhos ficam como estão.
- Não inventar funcionalidade: cada comando, atalho e requisito citado precisa existir no código.
  Referências conferidas:
  - atalho padrão `CmdOrCtrl+Shift+Y` (`internal/config/config.go:21`);
  - Node `>=18` (`npm/package.json`, `engines`);
  - subcomandos `start`, `stop`, `trigger`, `config`, `autostart`, `doctor`, `install`,
    `--version` (`npm/src/cli.ts`).
- URL base da documentação: `https://gustafsilva.github.io/kraa/docs/<slug>/`, com a barra
  final. Os slugs são os caminhos em `site/src/content/docs/` sem `.mdx` (por exemplo
  `uso/primeiros-passos`).
- Repositório: `gustafsilva/kraa`. Discussions: `https://github.com/gustafsilva/kraa/discussions`.
- Prazo de resposta prometido: **até 7 dias**. Issue sem atividade do responsável por **14
  dias** volta a ficar livre.
- Nomes de labels (exatos, usados nos templates e nas issues): `bug`, `enhancement`,
  `documentation`, `question`, `good first issue`, `help wanted`, `status: triagem`,
  `status: atribuída`, `area: frontend`, `area: backend`, `area: platform`,
  `area: providers`, `area: npm/cli`, `area: site`, `SO: macOS`, `SO: windows`, `SO: linux`.
- Commits em Conventional Commits, terminando com a linha
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Execução em paralelo:** as Tasks 1–5 mexem em arquivos disjuntos e rodam em paralelo.
  **Subagentes não fazem commit**: escrevem os arquivos, rodam a verificação da task e
  reportam. O controlador revisa e faz um commit por task. A Task 6 (GitHub) roda só depois da
  aprovação explícita do mantenedor, e a Task 7 fecha tudo.
- **Somente a Task 7 edita `CHANGELOG.md`** (evita conflito entre tasks paralelas).

## Review Focus

1. **Nome ou foto do mantenedor visível em algum quadro do GIF**: a saudação "Vamos lá,
   Gustavo" muda de posição e a foto fica no canto. Espera-se que nenhum quadro mostre o nome
   legível → Task 1, Step 3 (folha de contato a cada 0,5s, inspecionada quadro a quadro).
2. **Links quebrados no README/CONTRIBUTING** (caminho relativo errado, slug do site sem a barra
   final ou inexistente). Espera-se que todo link resolva → Tasks 2 e 3, verificação de links.
3. **Comando ou atalho documentado que não existe** (`kraa` sem o subcomando, atalho errado).
   Espera-se que o README bata com o código → Task 2, Step 3 (grep contra `cli.ts` e
   `config.go`).
4. **Template de issue com YAML inválido ou label inexistente**: o GitHub esconde o formulário
   ou simplesmente não aplica a label. Espera-se que o formulário apareça com as labels
   certas → Task 4, Step 2 (parse + checagem de labels) e Task 6, Step 3 (labels existem no
   GitHub).
5. **GIF pesado demais** para carregar no GitHub mobile. Espera-se < 5 MB → Task 1, Step 3.

---

### Task 1: GIF e imagem de demonstração

**Files:**
- Create: `docs/brand/source/make-demo.sh`
- Create: `docs/brand/demo.gif`
- Create: `docs/brand/demo.png`

**Interfaces:**
- Produces: `docs/brand/demo.gif` (usado pelo README na Task 2) e `docs/brand/demo.png`
  (plano B e uso futuro no site).
- Fora do escopo: o `demo.mp4` opcional do spec (seção 4) não entra neste plano.

Contexto: a fonte é `~/Downloads/Gravação de Tela 2026-09-26 às 22.31.29.mov` (25s,
2704×1520, 120 fps). Medições feitas no design:

| Trecho | Tempo | Tratamento |
|---|---|---|
| Digitação no Gemini + seleção | 1,0–6,4s | 3x mais rápido |
| Modal do Kraa (Melhorar prompt → stream → resultado) | 6,4–11,3s | velocidade normal |
| Texto substituído no Gemini | 11,3–13,5s | velocidade normal + 1,5s congelado no fim |

- Saudação "Vamos lá, Gustavo": caixa `630x160+1080+460` (cobre as duas posições). É borrada
  só **fora** do modal (o modal fica visível entre 6,5s e 11,3s e cobre essa área; borrar
  durante o modal borraria a interface).
- Foto de perfil: caixa `80x80+10+1420`, sempre borrada (o recorte já a exclui; o blur é uma
  garantia extra).
- Recorte final: `1390x1220+700+80` (campo do Gemini + modal).

O pipeline já foi validado no design: 10,3s, 719 KB.

- [ ] **Step 1: Criar o script**

`docs/brand/source/make-demo.sh`:

```bash
#!/usr/bin/env bash
# Gera docs/brand/demo.gif e docs/brand/demo.png a partir da gravação de tela do fluxo
# completo (Gemini → atalho → Melhorar prompt → Substituir).
#
# Os tempos e as caixas abaixo valem para a gravação de 2026-09-26 (2704x1520). Ao regravar,
# meça de novo: trechos (digitação, modal, resultado), a caixa da saudação com o nome e a
# caixa da foto de perfil.
#
# Uso: docs/brand/source/make-demo.sh "<gravação.mov>"
set -euo pipefail

INPUT="${1:?uso: make-demo.sh <gravação.mov>}"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

GREETING="630:160:1080:460"   # w:h:x:y da saudação "Vamos lá, <nome>"
AVATAR="80:80:10:1420"        # w:h:x:y da foto de perfil
CROP="1390:1220:700:80"       # enquadramento final (campo + modal)
MODAL_START=6.4               # modal cobre a saudação entre estes tempos
MODAL_END=11.35

blur_filters() {
  local g_w g_h g_x g_y a_w a_h a_x a_y
  IFS=: read -r g_w g_h g_x g_y <<<"$GREETING"
  IFS=: read -r a_w a_h a_x a_y <<<"$AVATAR"
  printf '%s' \
    "[0:v]split=2[base][g];" \
    "[g]crop=${g_w}:${g_h}:${g_x}:${g_y},boxblur=20:3[gb];" \
    "[base][gb]overlay=${g_x}:${g_y}:enable='not(between(t,${MODAL_START},${MODAL_END}))'[b1];" \
    "[b1]split=2[base2][a];" \
    "[a]crop=${a_w}:${a_h}:${a_x}:${a_y},boxblur=20:3[ab];" \
    "[base2][ab]overlay=${a_x}:${a_y},crop=${CROP}"
}

GIF_FILTER="$(blur_filters),split=3[s1][s2][s3];\
[s1]trim=1.0:6.4,setpts=(PTS-STARTPTS)/3[p1];\
[s2]trim=6.4:11.3,setpts=PTS-STARTPTS[p2];\
[s3]trim=11.3:13.5,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=1.5[p3];\
[p1][p2][p3]concat=n=3:v=1:a=0,fps=12,scale=800:-1:flags=lanczos,split[x][y];\
[x]palettegen=max_colors=128:stats_mode=diff[pal];\
[y][pal]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle"

ffmpeg -v error -y -i "$INPUT" -filter_complex "$GIF_FILTER" -an "$OUT_DIR/demo.gif"

# Quadro com o resultado pronto e o foco em "Substituir". O -ss vai DEPOIS do -i para manter
# o relógio original (t=10.8) e o blur da saudação continuar desligado durante o modal.
ffmpeg -v error -y -i "$INPUT" -ss 10.8 -filter_complex "$(blur_filters),scale=1200:-1:flags=lanczos" \
  -frames:v 1 "$OUT_DIR/demo.png"

ls -lh "$OUT_DIR/demo.gif" "$OUT_DIR/demo.png"
```

- [ ] **Step 2: Gerar os arquivos**

```bash
chmod +x docs/brand/source/make-demo.sh
docs/brand/source/make-demo.sh ~/Downloads/"Gravação de Tela 2026-09-26 às 22.31.29.mov"
```

Esperado: os dois arquivos listados, `demo.gif` com menos de 1 MB.

- [ ] **Step 3: Verificar privacidade, tamanho e duração**

```bash
S="${TMPDIR:-/tmp}/kraa-demo-check"; mkdir -p "$S"
ffprobe -v error -show_entries format=duration -of csv=p=0 docs/brand/demo.gif   # ~10.3
stat -f %z docs/brand/demo.gif                                                   # < 5000000
ffmpeg -v error -y -i docs/brand/demo.gif -vf "fps=2,scale=400:-1,tile=5x5" -frames:v 1 "$S/sheet.png"
```

Abra `$S/sheet.png` (com a ferramenta Read) e confira **cada quadro**:
- nenhum mostra "Gustavo" legível nem a foto de perfil;
- o modal aparece nítido (sem blur em cima da lista de ações ou do resultado);
- o fim mostra o texto substituído no campo do Gemini.

Abra também `docs/brand/demo.png`: modal com o resultado pronto, "Substituir" em destaque e
nenhum nome visível. Se algum quadro falhar, ajuste `GREETING`/`MODAL_START`/`MODAL_END` no
script e gere de novo.

- [ ] **Step 4: Reportar ao controlador** (sem commit)

O controlador mostra o GIF ao mantenedor para aprovação (spec: "o mantenedor aprova o GIF
antes de ele entrar no README") e então faz o commit:

```bash
git add docs/brand/source/make-demo.sh docs/brand/demo.gif docs/brand/demo.png
git commit -m "docs: GIF de demonstração do fluxo completo

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: README

**Files:**
- Modify (reescrita completa): `README.md`

**Interfaces:**
- Consumes: `docs/brand/demo.gif` (Task 1; pode ainda não existir durante a execução
  paralela, e a verificação de links trata esse caso). `CONTRIBUTING.md` (existe hoje e é
  reescrito na Task 3; o caminho não muda).

- [ ] **Step 1: Escrever o novo `README.md`**

Conteúdo completo (substitui o arquivo atual):

````markdown
<p align="center">
  <img src="docs/brand/kraa-banner.png" alt="Kraa, o corvo mascote" width="720">
</p>

# Kraa

[![CI](https://github.com/gustafsilva/kraa/actions/workflows/ci.yml/badge.svg)](https://github.com/gustafsilva/kraa/actions/workflows/ci.yml)
[![Docs](https://github.com/gustafsilva/kraa/actions/workflows/docs.yml/badge.svg)](https://gustafsilva.github.io/kraa/)
[![npm](https://img.shields.io/npm/v/kraa)](https://www.npmjs.com/package/kraa)
[![Licença MIT](https://img.shields.io/github/license/gustafsilva/kraa)](LICENSE)
[![PRs bem-vindos](https://img.shields.io/badge/PRs-bem--vindos-brightgreen)](CONTRIBUTING.md)

**Selecione um texto em qualquer app, aperte um atalho e melhore com IA — rodando local e de
graça com o [Ollama](https://ollama.com).**

<p align="center">
  <img src="docs/brand/demo.gif" alt="Demonstração: um prompt digitado no navegador é selecionado, o atalho abre o Kraa, a ação Melhorar prompt reescreve o texto e Substituir cola o resultado de volta" width="800">
</p>

## Por que usar

- **Funciona em qualquer app:** navegador, editor, chat, e-mail. Se dá para selecionar, dá para
  melhorar.
- **Local por padrão:** com o Ollama, o seu texto não sai da sua máquina.
- **Qualquer LLM compatível com a API da OpenAI:** Ollama, OpenAI, OpenRouter, LM Studio e
  outros.
- **macOS, Windows e Linux**, com fluxo 100% pelo teclado.

## Instalação

1. **Instale o [Ollama](https://ollama.com/download)** e baixe o modelo padrão:

   ```bash
   ollama pull llama3.2
   ```

2. **Instale e inicie o Kraa** (requer Node.js 18+):

   ```bash
   npm i -g kraa && kraa start
   ```

   O ícone do Kraa aparece na bandeja do sistema.

3. **Confira se está tudo certo:**

   ```bash
   kraa doctor
   ```

<details>
<summary>Sem Node.js, e observações por sistema</summary>

**Script de instalação**

```bash
curl -fsSL https://raw.githubusercontent.com/gustafsilva/kraa/main/scripts/install.sh | sh   # macOS / Linux
```

```powershell
irm https://raw.githubusercontent.com/gustafsilva/kraa/main/scripts/install.ps1 | iex        # Windows
```

**macOS:** conceda a permissão de **Acessibilidade** na primeira execução. Sem ela, só
"Copiar" funciona.

**Linux:** instale as dependências com
`sudo apt install libgtk-3-0 libwebkit2gtk-4.1-0 xdotool`. No Wayland só "Copiar" está
disponível; use `kraa trigger` como atalho do sistema.

</details>

Algo não funcionou? Veja a
[solução de problemas](https://gustafsilva.github.io/kraa/docs/ajuda/solucao-de-problemas/).

## Como usar

```
 seleciona texto   ──►   ⌘/Ctrl+Shift+Y   ──►   escolhe ação   ──►   resposta em stream
 em qualquer app         (captura a seleção)    ou instrução           │
                                                                       ├─► ⌘/Ctrl+Enter → Substituir
                                                                       └─► ⌘/Ctrl+Shift+C → Copiar
```

| Atalho | O que faz |
|---|---|
| `⌘⇧Y` (macOS) / `Ctrl+Shift+Y` | Abre o Kraa com o texto selecionado |
| `↑` `↓` `Enter` | Escolhe e executa uma ação (ou digite uma instrução livre) |
| `⌘/Ctrl+Enter` | Substitui a seleção original pelo resultado |
| `⌘/Ctrl+Shift+C` | Copia o resultado |
| `Esc` | Fecha e cancela |

## Documentação

| | |
|---|---|
| [Primeiros passos](https://gustafsilva.github.io/kraa/docs/uso/primeiros-passos/) | Da instalação à primeira melhoria |
| [Instalação](https://gustafsilva.github.io/kraa/docs/instalacao/npm/) | npm, scripts, Ollama, binários sem assinatura |
| [Configuração](https://gustafsilva.github.io/kraa/docs/configuracao/arquivo/) | `config.yaml`, providers, ações customizadas |
| [CLI](https://gustafsilva.github.io/kraa/docs/referencia/cli/) | `start`, `stop`, `trigger`, `doctor`… |
| [Plataformas](https://gustafsilva.github.io/kraa/docs/plataformas/macos/) | macOS, Windows, Linux (X11/Wayland) e privacidade |

## Contribua

Contribuições são bem-vindas, inclusive de quem está começando: documentação, testes em outros
sistemas, novas ações e providers. Comece pelas
[issues para iniciantes](https://github.com/gustafsilva/kraa/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22),
leia o [guia de contribuição](CONTRIBUTING.md) e tire dúvidas nas
[Discussions](https://github.com/gustafsilva/kraa/discussions).

## Licença

[MIT](LICENSE)
````

- [ ] **Step 2: Verificar links relativos**

```bash
node -e '
const fs=require("fs");
const md=fs.readFileSync("README.md","utf8");
const links=[...md.matchAll(/(?:\]\(|src=")([^)"#]+)/g)].map(m=>m[1]).filter(l=>!/^https?:/.test(l));
let bad=0;
for (const l of links){ if(!fs.existsSync(l)){ console.log("FALTA:",l); bad++; } }
console.log(links.length,"links relativos,",bad,"faltando");
'
```

Esperado: `0 faltando`. Exceção aceita durante a execução paralela: `docs/brand/demo.gif`,
se a Task 1 ainda não terminou (o controlador roda de novo na Task 7).

- [ ] **Step 3: Verificar links do site e comandos contra o código**

```bash
# slugs do site citados no README existem como .mdx
grep -o 'gustafsilva.github.io/kraa/docs/[a-z/-]*/' README.md | sed 's|.*/docs/||; s|/$||' | sort -u \
  | while read s; do test -f "site/src/content/docs/$s.mdx" && echo "ok $s" || echo "FALTA $s"; done
# subcomandos citados existem no cli.ts
for c in start doctor trigger; do grep -q "case \"$c\"" npm/src/cli.ts && echo "ok $c" || echo "FALTA $c"; done
grep -q 'DefaultHotkey = "CmdOrCtrl+Shift+Y"' internal/config/config.go && echo "ok atalho"
grep -q '"node": ">=18"' npm/package.json && echo "ok node18"
```

Esperado: todas as linhas `ok`, nenhuma `FALTA`.

- [ ] **Step 4: Reportar ao controlador** (sem commit). O controlador faz o commit:

```bash
git add README.md
git commit -m "docs: README focado em instalar e começar a usar

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: CONTRIBUTING, página de ambiente e CLAUDE.md

**Files:**
- Modify (reescrita completa): `CONTRIBUTING.md`
- Modify: `site/src/content/docs/contribuir/ambiente.mdx` (seção final "Fluxo de contribuição")
- Modify: `CLAUDE.md` (seção "Skills, MCPs e agentes relevantes")

**Interfaces:**
- Produces: âncoras em `CONTRIBUTING.md` usadas pelo template de PR (Task 4) e pelas issues
  (Task 5): `#como-pegar-uma-issue`, `#uso-de-ia`, `#antes-de-abrir-o-pr`.

- [ ] **Step 1: Escrever o novo `CONTRIBUTING.md`**

Conteúdo completo:

````markdown
# Contribuindo com o Kraa

Obrigado pelo interesse! Toda ajuda conta, e você não precisa saber Go para contribuir.

## Primeira vez em open source?

Bem-vindo! Estes guias explicam o básico:

- [Como contribuir com open source](https://opensource.guide/pt/how-to-contribute/) (Open
  Source Guides, em português)
- [Contribuindo com um projeto](https://docs.github.com/pt/get-started/exploring-projects-on-github/contributing-to-a-project)
  (fork, branch e pull request no GitHub)

Se travar em qualquer etapa, pergunte nas
[Discussions](https://github.com/gustafsilva/kraa/discussions). Não existe pergunta boba.

## Formas de contribuir

| Contribuição | O que você precisa saber |
|---|---|
| Relatar um bug ou testar no seu sistema (macOS, Windows, Linux) | Nada de código: usar o app e descrever o que viu |
| Melhorar a documentação | Markdown (as páginas do site ficam em `site/src/content/docs/`, em MDX) |
| Criar uma ação padrão (ex.: um novo tipo de reescrita) | Escrever um bom prompt; Go básico para o teste |
| Frontend do modal | React + TypeScript |
| Backend, providers e integração com o sistema | Go |

## Como pegar uma issue

1. Procure issues com a label
   [`good first issue`](https://github.com/gustafsilva/kraa/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
   (boas para começar) ou
   [`help wanted`](https://github.com/gustafsilva/kraa/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22).
2. Comente na issue pedindo para ser atribuído e **espere a atribuição** antes de abrir o PR.
   Assim ninguém faz o mesmo trabalho em dobro.
3. Se a issue ficar **14 dias** sem atividade de quem a pegou, ela volta a ficar livre.
4. Tem uma ideia nova? Abra uma issue ou uma discussão **antes de codar**, para
   combinarmos a abordagem.

## Sua primeira contribuição, passo a passo

1. **Faça um fork** do repositório e clone o seu fork:

   ```bash
   git clone https://github.com/<seu-usuario>/kraa.git
   cd kraa
   ```

2. **Crie um branch** a partir de `main`:

   ```bash
   git switch -c docs/corrige-link-instalacao
   ```

3. **Prepare o ambiente.** Só documentação? Basta `npm --prefix site ci && npm --prefix site run dev`.
   Para o app, siga o guia
   [Ambiente de desenvolvimento](https://gustafsilva.github.io/kraa/docs/contribuir/ambiente/)
   (Go, Node e a CLI do Wails). O resumo:

   ```bash
   go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-beta.26
   npm --prefix frontend ci
   wails3 dev
   ```

4. **Escreva o teste primeiro.** O projeto usa TDD: escreva o teste, veja falhar, implemente,
   veja passar. Veja [Testes](https://gustafsilva.github.io/kraa/docs/contribuir/testes/).
5. **Rode a verificação** (seção abaixo).
6. **Faça o commit** no formato [Conventional Commits](https://www.conventionalcommits.org/pt-br/):
   `feat(frontend): …`, `fix(llm): …`, `docs: …`.
7. **Abra o pull request** preenchendo o template, com `Fecha #<número da issue>`.

## Antes de abrir o PR

```bash
go test ./...                 # Linux: go test -tags gtk3 ./...
npm --prefix frontend test
npm --prefix npm test
npm --prefix site run build   # se mudou a documentação
```

- Mudanças visíveis ao usuário entram na seção "Não lançado" do [`CHANGELOG.md`](CHANGELOG.md)
  e na documentação em `site/src/content/docs/`.
- Se a mudança afeta um sistema específico, diga no PR em quais sistemas você testou.

## Regras do projeto

- **Wails isolado:** só `main.go` e `internal/app` importam o Wails. `internal/config`,
  `internal/llm`, `internal/improver` e `internal/platform/capture.go` não.
- **Código por sistema operacional** usa build tags (`keys_darwin.go`, `keys_windows.go`,
  `keys_linux.go`), nunca `if runtime.GOOS` espalhado.
- **Idioma:** textos da interface em PT-BR; identificadores e código em inglês.

A [arquitetura](https://gustafsilva.github.io/kraa/docs/contribuir/arquitetura/) explica como
os pacotes se encaixam.

## Uso de IA

Pode usar assistentes de IA, mas **quem envia é responsável pelo que envia**:

- entenda e saiba explicar cada linha do seu PR;
- rode os testes localmente antes de abrir o PR;
- marque no template do PR se usou IA de forma relevante.

PRs claramente gerados sem revisão (código que não compila, testes que não rodam, mudanças
fora do escopo da issue) são fechados. Se usar um agente, o [`CLAUDE.md`](CLAUDE.md) do
repositório dá o contexto do projeto para ele.

## Revisão

Respondemos issues e PRs em **até 7 dias**. Se passar disso, comente no PR marcando o
mantenedor. Pedidos de ajuste fazem parte do processo e não são rejeição.

## Código de conduta e dúvidas

Ao participar, você concorda com o [Código de conduta](CODE_OF_CONDUCT.md). Dúvidas e ideias
vão para as [Discussions](https://github.com/gustafsilva/kraa/discussions); vulnerabilidades,
para o [SECURITY.md](SECURITY.md).
````

- [ ] **Step 2: Atualizar `ambiente.mdx`**

Em `site/src/content/docs/contribuir/ambiente.mdx`, substituir a seção inteira
`## Fluxo de contribuição` (do título até o fim do arquivo, a lista numerada de 5 itens) por:

```mdx
## Fluxo de contribuição

Como escolher uma issue, o passo a passo do primeiro pull request, a política de uso de IA e
o checklist antes do PR estão no
[CONTRIBUTING.md](https://github.com/gustafsilva/kraa/blob/main/CONTRIBUTING.md).
```

- [ ] **Step 3: Limpar referências antigas no `CLAUDE.md`**

Duas edições exatas na seção "Skills, MCPs e agentes relevantes":

- `` - `frontend-design`: direção visual do modal (Task 7). ``
  → `` - `frontend-design`: direção visual do modal. ``
- `` - `.claude/agents/cross-platform-reviewer.md`: revisor focado em código
  específico de SO — usar nas Tasks 5 e 6. ``
  → `` - `.claude/agents/cross-platform-reviewer.md`: revisor focado em código
  específico de SO — usar em mudanças em `internal/platform`, `internal/app` ou `main.go`. ``

Conferir: `grep -n "Task [0-9]\|Tasks [0-9]" CLAUDE.md` não retorna nada.

- [ ] **Step 4: Verificar**

```bash
node -e '
const fs=require("fs");
const md=fs.readFileSync("CONTRIBUTING.md","utf8");
const links=[...md.matchAll(/\]\(([^)#]+)/g)].map(m=>m[1]).filter(l=>!/^https?:/.test(l));
let bad=0; for (const l of links){ if(!fs.existsSync(l)){ console.log("FALTA:",l); bad++; } }
console.log(links.length,"links relativos,",bad,"faltando");
'
grep -o 'gustafsilva.github.io/kraa/docs/[a-z/-]*/' CONTRIBUTING.md | sed 's|.*/docs/||; s|/$||' | sort -u \
  | while read s; do test -f "site/src/content/docs/$s.mdx" && echo "ok $s" || echo "FALTA $s"; done
for a in "## Como pegar uma issue" "## Uso de IA" "## Antes de abrir o PR"; do grep -q "^$a$" CONTRIBUTING.md && echo "ok $a"; done
npm --prefix site run build
```

Esperado: `0 faltando`, todas as linhas `ok` e o build do site sem erro.

- [ ] **Step 5: Reportar ao controlador** (sem commit). O controlador faz o commit:

```bash
git add CONTRIBUTING.md site/src/content/docs/contribuir/ambiente.mdx CLAUDE.md
git commit -m "docs: guia de contribuição focado na primeira contribuição

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Templates de issue e de PR

**Files:**
- Modify: `.github/ISSUE_TEMPLATE/bug_report.yml` (linha `labels:`)
- Modify (reescrita completa): `.github/ISSUE_TEMPLATE/feature_request.yml`
- Create: `.github/ISSUE_TEMPLATE/docs.yml`
- Modify (reescrita completa): `.github/ISSUE_TEMPLATE/config.yml`
- Modify (reescrita completa): `.github/pull_request_template.md`

**Interfaces:**
- Consumes: nomes de labels das Global Constraints; âncoras do CONTRIBUTING (Task 3):
  `#uso-de-ia`. Links no template de PR são absolutos (links relativos no corpo de um PR não
  resolvem de forma confiável).

- [ ] **Step 1: Escrever os arquivos**

`bug_report.yml`: trocar só a linha `labels: [bug]` por:

```yaml
labels: [bug, "status: triagem"]
```

`feature_request.yml`:

```yaml
name: Sugerir uma melhoria
description: Uma ideia de recurso ou mudança.
labels: [enhancement, "status: triagem"]
body:
  - type: textarea
    id: problem
    attributes:
      label: Qual problema isso resolve?
    validations:
      required: true
  - type: textarea
    id: proposal
    attributes:
      label: Proposta
      description: Como você imagina que funcione.
    validations:
      required: true
  - type: textarea
    id: alternatives
    attributes:
      label: Alternativas consideradas
  - type: dropdown
    id: implement
    attributes:
      label: Você gostaria de implementar?
      options:
        - Sim
        - Talvez, com ajuda
        - Não
    validations:
      required: true
```

`docs.yml`:

```yaml
name: Melhorar a documentação
description: Algo confuso, errado ou faltando no README, no CONTRIBUTING ou no site.
labels: [documentation, "status: triagem"]
body:
  - type: input
    id: page
    attributes:
      label: Página ou arquivo
      description: URL do site ou caminho no repositório.
      placeholder: https://gustafsilva.github.io/kraa/docs/uso/primeiros-passos/
    validations:
      required: true
  - type: textarea
    id: problem
    attributes:
      label: O que está confuso, errado ou faltando?
    validations:
      required: true
  - type: textarea
    id: suggestion
    attributes:
      label: Sugestão
      description: Como o texto poderia ficar, se você já tiver uma ideia.
  - type: dropdown
    id: implement
    attributes:
      label: Você gostaria de fazer essa melhoria?
      options:
        - Sim
        - Talvez, com ajuda
        - Não
```

`config.yml`:

```yaml
blank_issues_enabled: false
contact_links:
  - name: Dúvidas e ideias
    url: https://github.com/gustafsilva/kraa/discussions
    about: Perguntas sobre uso, configuração ou ideias ainda em aberto.
  - name: Documentação
    url: https://gustafsilva.github.io/kraa/
    about: Instalação, configuração e solução de problemas.
  - name: Reportar uma vulnerabilidade
    url: https://github.com/gustafsilva/kraa/security/advisories/new
    about: Vulnerabilidades devem ser reportadas em privado, não em issues.
```

`pull_request_template.md`:

```markdown
## O que muda

<!-- Descreva a mudança e o motivo. -->

Fecha #

## Como foi testado

- [ ] `go test ./...` (Linux: `-tags gtk3`)
- [ ] `npm --prefix frontend test`
- [ ] `npm --prefix npm test`
- [ ] `npm --prefix site run build` (se mudou a documentação)
- [ ] Checklist manual nos SOs afetados: <!-- macOS / Windows / Linux X11 / Linux Wayland -->

## Checklist

- [ ] Li o [guia de contribuição](https://github.com/gustafsilva/kraa/blob/main/CONTRIBUTING.md)
- [ ] Textos da UI em PT-BR
- [ ] Documentação atualizada (`site/src/content/docs`) e item no `CHANGELOG.md`
- [ ] Não usei IA, ou usei e revisei e entendo todo o código ([política de uso de IA](https://github.com/gustafsilva/kraa/blob/main/CONTRIBUTING.md#uso-de-ia))
```

- [ ] **Step 2: Validar YAML e labels**

```bash
node -e '
const fs=require("fs"); const YAML=require("./site/node_modules/yaml");
const allowed=new Set(["bug","enhancement","documentation","question","good first issue","help wanted","status: triagem","status: atribuída","area: frontend","area: backend","area: platform","area: providers","area: npm/cli","area: site","SO: macOS","SO: windows","SO: linux"]);
const dir=".github/ISSUE_TEMPLATE"; let bad=0;
for (const f of fs.readdirSync(dir)){
  const doc=YAML.parse(fs.readFileSync(`${dir}/${f}`,"utf8"));
  if (f==="config.yml"){ console.log("ok",f,doc.contact_links.length,"links"); continue; }
  for (const k of ["name","description","body"]) if(!doc[k]){ console.log("FALTA",k,"em",f); bad++; }
  for (const l of doc.labels||[]) if(!allowed.has(l)){ console.log("LABEL DESCONHECIDA",l,"em",f); bad++; }
  const ids=doc.body.filter(b=>b.id).map(b=>b.id);
  if (new Set(ids).size!==ids.length){ console.log("ID DUPLICADO em",f); bad++; }
  console.log("ok",f,(doc.labels||[]).join(", "));
}
process.exit(bad?1:0);
'
```

Esperado: `ok` para os 4 arquivos, saída 0.

- [ ] **Step 3: Reportar ao controlador** (sem commit). O controlador faz o commit:

```bash
git add .github/ISSUE_TEMPLATE .github/pull_request_template.md
git commit -m "chore(github): templates com triagem, docs e política de IA

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Rascunho das issues iniciais

**Files:**
- Create: `docs/issues-iniciais.md`

**Interfaces:**
- Consumes: nomes de labels das Global Constraints.
- Produces: `docs/issues-iniciais.md`, com cada issue num bloco `## <título>` seguido de uma
  linha `Labels: a, b, c` e do corpo em Markdown. A Task 6 publica cada bloco com
  `gh issue create`.

Esta task é de **pesquisa no código**: cada "Arquivos envolvidos" precisa apontar para arquivos
e funções que existem, e cada critério de pronto precisa ser verificável.

- [ ] **Step 1: Levantar o contexto**

Ler, no mínimo:
- `internal/llm/client.go` e `internal/llm/models.go` (como o streaming SSE e a listagem de
  modelos são feitos, quais campos são enviados, incluindo `temperature`);
- `internal/config/defaults.go` (template do `config.yaml` e ações padrão);
- `site/src/content/docs/configuracao/providers.mdx` e `acoes-customizadas.mdx`;
- os arquivos `*_test.go` de `internal/llm`, `internal/config` e `internal/improver`, para achar
  pontos sem cobertura;
- a seção "Checklist de verificação manual por SO" do `CLAUDE.md`.

- [ ] **Step 2: Escrever `docs/issues-iniciais.md`**

Cabeçalho do arquivo:

```markdown
# Issues iniciais (rascunho)

Rascunho para revisão do mantenedor. Depois de aprovado, cada bloco `##` vira uma issue
(`gh issue create`, Task 6 do plano `docs/superpowers/plans/2026-09-26-readme-contribuicao.md`).
```

Formato obrigatório de cada issue:

```markdown
## <Título curto no imperativo, em PT-BR>

Labels: <labels separadas por vírgula, só da lista permitida>

### Contexto
<por que isso importa, 2–4 frases>

### O que fazer
- <passos concretos>

### Arquivos envolvidos
- `<caminho>`: <o que muda ali>

### Critério de pronto
- [ ] <verificável>

### Como testar
<comandos ou passos manuais>

Primeira vez por aqui? Veja o [guia de contribuição](https://github.com/gustafsilva/kraa/blob/main/CONTRIBUTING.md#como-pegar-uma-issue) e comente pedindo para ser atribuído.
```

Issues a escrever (de 9 a 10 no total):

1. **Provider Gemini:** base `https://generativelanguage.googleapis.com/v1beta/openai/`.
   Labels: `area: providers`, `documentation`, `good first issue`, `help wanted`.
2. **Provider Anthropic:** base `https://api.anthropic.com/v1/` (camada de compatibilidade com
   o SDK da OpenAI). Mesmas labels.
3. **Provider Grok (xAI):** base `https://api.x.ai/v1`. Mesmas labels.
4. **Provider OpenRouter:** base `https://openrouter.ai/api/v1`. Mesmas labels.

   Cada issue de provider pede para: configurar o `config.yaml`, validar o streaming, a
   `temperature` e a listagem de modelos no seletor (`internal/llm/models.go`), documentar a
   receita em `providers.mdx` (seção própria, no formato das seções "Ollama Cloud"/"OpenAI") e
   abrir uma issue separada, ou corrigir no mesmo PR, se algo quebrar. Critério: receita
   documentada + print ou relato do stream funcionando + `npm --prefix site run build` passando.
5. **Nova ação padrão:** propor uma ação que **não existe** entre as atuais (Melhorar prompt,
   Adicionar contexto, Mais específico, Mais formal, Mais casual, Mais curto, Corrigir
   gramática, Traduzir para inglês). Conferir a lista real em `internal/config/defaults.go`.
   Sugestão: "Resumir em tópicos". Incluir o teste em `internal/config` que garante a ação no
   template padrão e a atualização de `acoes-customizadas.mdx` ou da página que lista as ações.
   Labels: `area: backend`, `good first issue`.
6. **Revisão de docs com olhar de iniciante:** seguir `uso/primeiros-passos` do zero numa
   máquina limpa e abrir um PR corrigindo o que estiver confuso. Labels: `documentation`,
   `area: site`, `good first issue`.
7. **Checklist manual no Windows:** rodar a seção "Windows" do checklist do `CLAUDE.md` e relatar
   os resultados na issue (sem código). Labels: `SO: windows`, `help wanted`.
8. **Checklist manual no Linux (X11 e Wayland):** idem, para Ubuntu X11 e Wayland. Labels:
   `SO: linux`, `help wanted`.
9. **Teste sem cobertura (1 ou 2 issues):** escolher pontos reais sem teste achados no Step 1
   (citar a função e o caso não coberto). Labels: a área correspondente, `good first issue` só
   se o teste for pequeno.

Regra: se a pesquisa mostrar que algo já existe (por exemplo, uma receita de provider já
documentada), trocar a issue por outra e registrar o motivo numa nota no fim do arquivo.

- [ ] **Step 3: Verificar o rascunho**

```bash
node -e '
const fs=require("fs");
const allowed=new Set(["bug","enhancement","documentation","question","good first issue","help wanted","status: triagem","status: atribuída","area: frontend","area: backend","area: platform","area: providers","area: npm/cli","area: site","SO: macOS","SO: windows","SO: linux"]);
const md=fs.readFileSync("docs/issues-iniciais.md","utf8");
const blocks=md.split(/^## /m).slice(1); let bad=0;
for (const b of blocks){
  const title=b.split("\n")[0]; const m=b.match(/^Labels: (.+)$/m);
  if(!m){ console.log("SEM LABELS:",title); bad++; continue; }
  for (const l of m[1].split(",").map(s=>s.trim())) if(!allowed.has(l)){ console.log("LABEL DESCONHECIDA",l,"em",title); bad++; }
  for (const s of ["### Contexto","### O que fazer","### Arquivos envolvidos","### Critério de pronto","### Como testar"]) if(!b.includes(s)){ console.log("FALTA",s,"em",title); bad++; }
  const sec=(b.split("### Arquivos envolvidos")[1]||"").split("\n### ")[0];
  const files=[...sec.matchAll(/^- `([^`]+)`/gm)].map(x=>x[1]);
  for (const f of files) if(!fs.existsSync(f.replace(/:\d+.*$/,""))){ console.log("ARQUIVO INEXISTENTE",f,"em",title); bad++; }
}
console.log(blocks.length,"issues,",bad,"problemas"); process.exit(bad?1:0);
'
```

Esperado: 9 a 10 issues, `0 problemas`. Arquivos que a issue pede para **criar** devem ser
escritos como texto normal ("criar `…`"), não como item `` - `caminho` ``.

- [ ] **Step 4: Reportar ao controlador** (sem commit). O controlador faz o commit:

```bash
git add docs/issues-iniciais.md
git commit -m "docs: rascunho das issues iniciais para novos contribuidores

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Aplicar no GitHub (controlador, com aprovação do mantenedor)

**Executado pelo controlador, não por subagente.** Todas as ações são públicas e visíveis no
repositório. **Antes do Step 2, mostrar ao mantenedor o `docs/issues-iniciais.md` e a lista de
mudanças abaixo, e esperar um "sim" explícito.**

**Files:** nenhum no repositório.

**Interfaces:**
- Consumes: nomes de labels (Global Constraints), `docs/issues-iniciais.md` (Task 5).

- [ ] **Step 1: Pedir aprovação**

Resumo para o mantenedor: labels novas/editadas (lista abaixo), descrição, homepage e topics,
Discussions ativado e as N issues do rascunho. Esperar a aprovação e aplicar as correções que
ele pedir no rascunho antes de seguir.

- [ ] **Step 2: Labels**

```bash
R=gustafsilva/kraa
gh label edit bug                -R $R --description "Algo não funciona como deveria"
gh label edit enhancement        -R $R --description "Novo recurso ou melhoria"
gh label edit documentation      -R $R --description "Melhorias ou acréscimos na documentação"
gh label edit question           -R $R --description "Pedido de mais informações"
gh label edit "good first issue" -R $R --description "Boa para quem está começando"
gh label edit "help wanted"      -R $R --description "Ajuda da comunidade é bem-vinda"
gh label edit duplicate          -R $R --description "Issue ou PR já existe"
gh label edit invalid            -R $R --description "Não parece correto"
gh label edit wontfix            -R $R --description "Não será trabalhado"
gh label edit accessibility      -R $R --description "Barreira para pessoas com deficiência"
gh label create "status: triagem"   -R $R --color fbca04 --description "Aguardando triagem do mantenedor"
gh label create "status: atribuída" -R $R --color 0e8a16 --description "Alguém já está trabalhando nisso"
gh label create "area: frontend"    -R $R --color 1d76db --description "Modal em React (frontend/)"
gh label create "area: backend"     -R $R --color 1d76db --description "Go: config, improver, app"
gh label create "area: platform"    -R $R --color 1d76db --description "Código específico de SO (internal/platform)"
gh label create "area: providers"   -R $R --color 1d76db --description "Integração com LLMs (internal/llm)"
gh label create "area: npm/cli"     -R $R --color 1d76db --description "Instalador e CLI npm (npm/)"
gh label create "area: site"        -R $R --color 1d76db --description "Site de documentação (site/)"
gh label create "SO: macOS"         -R $R --color c5def5 --description "Precisa de alguém com macOS"
gh label create "SO: windows"       -R $R --color c5def5 --description "Precisa de alguém com Windows"
gh label create "SO: linux"         -R $R --color c5def5 --description "Precisa de alguém com Linux"
```

- [ ] **Step 3: Verificar as labels**

```bash
node -e '
const {execSync}=require("child_process");
const have=new Set(JSON.parse(execSync("gh label list -R gustafsilva/kraa --json name --limit 100")).map(l=>l.name));
const need=["bug","enhancement","documentation","question","good first issue","help wanted","status: triagem","status: atribuída","area: frontend","area: backend","area: platform","area: providers","area: npm/cli","area: site","SO: macOS","SO: windows","SO: linux"];
const miss=need.filter(n=>!have.has(n)); console.log(miss.length?"FALTAM: "+miss.join(", "):"ok todas as labels");
'
```

Esperado: `ok todas as labels`.

- [ ] **Step 4: Repositório e Discussions**

```bash
gh repo edit gustafsilva/kraa \
  --description "Melhore o texto selecionado em qualquer app com IA local (Ollama) ou qualquer API compatível com OpenAI. macOS, Windows e Linux." \
  --homepage "https://gustafsilva.github.io/kraa/" \
  --enable-discussions \
  --add-topic ollama,llm,writing-assistant,wails,go,react,tray-app,productivity,open-source-ai
gh repo view gustafsilva/kraa --json description,homepageUrl,hasDiscussionsEnabled,repositoryTopics
```

As categorias "Dúvidas", "Ideias" e "Mostre seu uso" não podem ser criadas pela API do GitHub.
Passo manual para o mantenedor: em `https://github.com/gustafsilva/kraa/discussions/categories`,
renomear "Q&A" para "Dúvidas", "Ideas" para "Ideias" e "Show and tell" para "Mostre seu uso".

- [ ] **Step 5: Publicar as issues**

```bash
node -e '
const fs=require("fs"); const {execFileSync}=require("child_process");
const md=fs.readFileSync("docs/issues-iniciais.md","utf8");
for (const b of md.split(/^## /m).slice(1)){
  const lines=b.split("\n"); const title=lines[0].trim();
  const labels=b.match(/^Labels: (.+)$/m)[1];
  const body=b.slice(b.indexOf("\n", b.search(/^Labels: /m))+1).split(/^---\s*$/m)[0].trim();
  const url=execFileSync("gh",["issue","create","-R","gustafsilva/kraa","--title",title,"--label",labels,"--body",body]).toString().trim();
  console.log(url, title);
}
'
gh issue list -R gustafsilva/kraa --limit 20
```

Esperado: uma URL por issue e a lista com todas elas. Se o arquivo tiver notas no fim (depois
de uma linha `---`), elas não entram no corpo da última issue.

---

### Task 7: CHANGELOG e verificação final

**Files:**
- Modify: `CHANGELOG.md` (seção `## [Não lançado]`)

- [ ] **Step 1: Item no CHANGELOG**

Em `CHANGELOG.md`, dentro de `## [Não lançado]` → `### Alterado`, adicionar ao fim da lista:

```markdown
- README reescrito com foco em instalar e começar a usar (GIF de demonstração, instalação em
  três passos e tabela de atalhos) e guia de contribuição voltado à primeira contribuição
  (como pegar uma issue, passo a passo, política de uso de IA e prazo de resposta). Novos
  templates de issue para documentação e checklist de IA no template de PR.
```

- [ ] **Step 2: Verificação completa**

```bash
# links relativos de README e CONTRIBUTING (agora o demo.gif precisa existir)
node -e '
const fs=require("fs"); let bad=0;
for (const f of ["README.md","CONTRIBUTING.md"]){
  const md=fs.readFileSync(f,"utf8");
  for (const [,l] of md.matchAll(/(?:\]\(|src=")([^)"#]+)/g)) if(!/^https?:/.test(l) && !fs.existsSync(l)){ console.log("FALTA",l,"em",f); bad++; }
}
console.log(bad,"faltando"); process.exit(bad?1:0);
'
npm --prefix site run build
npm --prefix site run check
git status --short
```

Esperado: `0 faltando`, build e check sem erro, só as mudanças esperadas no `git status`.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: registra README e guia de contribuição no CHANGELOG

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Revisão final do branch** e integração via
  `superpowers:finishing-a-development-branch`.
