# Prompt Improve

App de bandeja (macOS, Windows, Ubuntu) que melhora um texto selecionado em
qualquer aplicativo via LLM compatível com OpenAI (padrão: Ollama local). Um
atalho global abre um modal com ações pré-configuradas e instrução livre; o
resultado chega em stream e pode ser **Substituído** no app de origem ou
**Copiado**.

Módulo Go: `github.com/gustavofreitas/prompt-improve`. Identificador único do
app: `dev.matrixia.prompt-improve`.

## Stack

Go 1.24+, Wails v3 (versão fixada no `go.mod`), React + TypeScript + Vite,
Tailwind, shadcn/ui, `gopkg.in/yaml.v3`, Vitest + Testing Library.

## Mapa de pacotes

| Pacote | Responsabilidade |
|---|---|
| `main.go` | Bootstrap Wails: app, tray, janela, atalho global, single-instance. |
| `internal/config` | Tipos de config, `Load`/`Save`/`Default`, validação, ações padrão. |
| `internal/llm` | Cliente OpenAI-compatível com streaming SSE (`/v1/chat/completions`). |
| `internal/improver` | Monta mensagens (system + user) a partir de ação/instrução e roda o stream. |
| `internal/platform` | Interfaces `Clipboard`/`KeySender`, `Capture`/`Paste`, detecção de sessão e teclas por SO (`keys_darwin.go`, `keys_windows.go`, `keys_linux.go`, `session_linux.go`). |
| `internal/app` | `ImproveService` exposto ao frontend (bindings) e adapters do Wails (clipboard, emitter). |
| `frontend/src` | Modal em React: `App.tsx`, `components/*` (ActionList, PreviewPane, Footer), `lib/useImprove.ts`. |

## Comandos

- `wails3 dev` — sobe a app em modo desenvolvimento (tray + hot reload do frontend).
- `wails3 build` — build de produção.
- `wails3 generate bindings -ts` — regenera os bindings TS a partir dos métodos Go expostos.
- `go test ./...` — testes do backend.
- `npm --prefix frontend test` — testes do frontend (Vitest).

## Regras

- Os pacotes `internal/config`, `internal/llm`, `internal/improver` e
  `internal/platform/capture.go` **não importam o Wails**. Só `main.go` e
  `internal/app` podem depender de `github.com/wailsapp/wails/v3`.
- TDD: escrever o teste, ver falhar, implementar, ver passar (skill
  `superpowers:test-driven-development`).
- Textos e mensagens da UI ficam em **PT-BR**; identificadores e código ficam
  em inglês.
- Código específico de SO usa build tags (`keys_darwin.go`, `keys_windows.go`,
  `keys_linux.go`, `session_linux.go`), nunca `if runtime.GOOS` espalhado.
- Antes de usar uma API do Wails v3 ou do shadcn/ui, consultar a
  documentação via **context7** (não confiar de memória, a API do Wails v3
  ainda muda entre betas).

## Skills, MCPs e agentes relevantes

- **context7** (MCP global): docs do Wails v3, shadcn/ui e Tailwind.
- **shadcn MCP** (`.mcp.json`, deste projeto): consultar e adicionar
  componentes shadcn/ui.
- `superpowers:test-driven-development`: fluxo de TDD em cada pacote.
- `superpowers:subagent-driven-development`: execução das tasks do plano,
  um implementador por task.
- `superpowers:verification-before-completion`: rodar e conferir os
  comandos de verificação antes de marcar uma task como concluída.
- `frontend-design`: direção visual do modal (Task 7).
- `code-review` / `simplify`: revisão final de cada task.
- `.claude/agents/cross-platform-reviewer.md`: revisor focado em código
  específico de SO — usar nas Tasks 5 e 6.

## Checklist de verificação manual por SO

**macOS** (com Ollama rodando)
- Selecionar texto em outro app, apertar o atalho (`⌘⇧Y` por padrão): o
  modal abre com o texto capturado.
- Escolher uma ação: o preview aparece em stream.
- `⌘Enter` substitui o texto no app de origem e o clipboard volta ao valor
  anterior.
- Sem permissão de Acessibilidade: aviso no modal, "Substituir" some, só
  "Copiar" funciona.
- Sem seleção: modal abre vazio e editável.
- `Esc` durante o stream fecha sem erro no log.

**Windows**
- Mesmo checklist do macOS (atalho, preview em stream, `Ctrl+Enter`
  substitui, clipboard restaurado, `Esc` cancela sem erro).
- Janela não aparece na barra de tarefas (`HiddenOnTaskbar`).

**Ubuntu**
- X11: mesmo checklist do macOS, com `xdotool` instalado.
- X11 sem `xdotool`: aviso claro, só "Copiar" disponível.
- Wayland: usar `prompt-improve --trigger` como atalho do GNOME; só
  "Copiar" aparece (sem colagem automática).

**Todos os SOs**
- Ollama parado: mensagem de erro legível com a dica `ollama serve`
  (nunca um stack trace).
- `go test ./...` e `npm --prefix frontend test` passam antes de cada
  commit de task.
