# Prompt Improve

[![CI](https://github.com/gustafsilva/prompt-improve-beta/actions/workflows/ci.yml/badge.svg)](https://github.com/gustafsilva/prompt-improve-beta/actions/workflows/ci.yml)
[![Docs](https://github.com/gustafsilva/prompt-improve-beta/actions/workflows/docs.yml/badge.svg)](https://gustafsilva.github.io/prompt-improve-beta/)
[![npm](https://img.shields.io/npm/v/prompt-improve)](https://www.npmjs.com/package/prompt-improve)

App de bandeja (macOS, Windows, Linux) que melhora o texto selecionado em qualquer aplicativo
usando um LLM compatível com a API OpenAI (padrão: [Ollama](https://ollama.com) local). Um atalho
global captura a seleção e abre um modal com ações prontas e instrução livre; o resultado chega em
stream e pode ser **Substituído** no app de origem ou **Copiado**.

**📖 Documentação: <https://gustafsilva.github.io/prompt-improve-beta/>**

```
 seleciona texto   ──►   ⌘/Ctrl+Shift+Y   ──►   escolhe ação   ──►   resposta em stream
 em qualquer app         (captura a seleção)    ou instrução           │
                                                                       ├─► ⌘/Ctrl+Enter → Substituir
                                                                       └─► ⌘/Ctrl+Shift+C → Copiar
```

## Instalação rápida

```bash
ollama pull llama3.2 && ollama serve          # LLM local (https://ollama.com/download)
npm i -g prompt-improve && prompt-improve start
```

Sem Node:

```bash
curl -fsSL https://raw.githubusercontent.com/gustafsilva/prompt-improve-beta/main/scripts/install.sh | sh   # macOS / Linux
```

```powershell
irm https://raw.githubusercontent.com/gustafsilva/prompt-improve-beta/main/scripts/install.ps1 | iex        # Windows
```

- **macOS:** conceda a permissão de Acessibilidade na primeira execução.
- **Linux:** `sudo apt install libgtk-3-0 libwebkit2gtk-4.1-0 xdotool`. No Wayland só "Copiar"
  está disponível.

Algo não funcionou? Rode `prompt-improve doctor` e veja a
[solução de problemas](https://gustafsilva.github.io/prompt-improve-beta/docs/ajuda/solucao-de-problemas/).

## Documentação

| | |
|---|---|
| [Primeiros passos](https://gustafsilva.github.io/prompt-improve-beta/docs/uso/primeiros-passos/) | Da instalação à primeira melhoria |
| [Instalação](https://gustafsilva.github.io/prompt-improve-beta/docs/instalacao/npm/) | npm, scripts, Ollama, binários sem assinatura |
| [Configuração](https://gustafsilva.github.io/prompt-improve-beta/docs/configuracao/arquivo/) | `config.yaml`, providers, ações customizadas |
| [CLI](https://gustafsilva.github.io/prompt-improve-beta/docs/referencia/cli/) | `start`, `stop`, `trigger`, `doctor`… |
| [Plataformas](https://gustafsilva.github.io/prompt-improve-beta/docs/plataformas/macos/) | macOS, Windows, Linux (X11/Wayland) e privacidade |

A fonte da documentação fica em [`site/src/content/docs`](site/src/content/docs) (MDX).

## Desenvolvimento

```bash
go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-beta.26
npm --prefix frontend ci
wails3 dev                     # app em modo desenvolvimento
go test ./...                  # Linux: go test -tags gtk3 ./...
npm --prefix frontend test
npm --prefix npm test
npm --prefix site run dev      # site de documentação
```

Veja o [guia de contribuição](CONTRIBUTING.md), a
[arquitetura](https://gustafsilva.github.io/prompt-improve-beta/docs/contribuir/arquitetura/) e o
[`CLAUDE.md`](CLAUDE.md). Mudanças ficam no [CHANGELOG](CHANGELOG.md); vulnerabilidades, pelo
[SECURITY.md](SECURITY.md).
