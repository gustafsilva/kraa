# Prompt Improve: plano de implementação

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` (método escolhido pelo usuário). Os passos usam checkbox (`- [ ]`).

**Objetivo:** app desktop (macOS, Windows e Ubuntu) que fica na bandeja. O usuário seleciona um texto em qualquer app e aperta um atalho global. Abre um modal com ações de melhoria (prompt para IA ou mensagem de chat) e uma instrução livre. O resultado aparece em stream, com preview, e pode ser **substituído** no app de origem ou **copiado**.

**Arquitetura:** processo único em Wails v3. O backend em Go faz o atalho, a captura e colagem via clipboard com simulação de teclas, a config YAML e o cliente LLM compatível com OpenAI. O frontend em React + shadcn/ui é só a UI do modal. A lógica fica em pacotes `internal/*`, que não dependem do Wails e são testáveis com fakes. O Wails fica restrito a `main.go` e `internal/app`.

**Stack:** Go 1.24 (instalado: 1.24.1), Wails v3 (versão fixada no `go.mod`), React + TypeScript + Vite, Tailwind, shadcn/ui (`command`, `textarea`, `button`, `scroll-area`, `alert`), `gopkg.in/yaml.v3`, Vitest + Testing Library.

**Spec:** não existe um arquivo separado. O design aprovado no brainstorming está condensado na seção "Design" abaixo, e a Task 0 grava esse design em `docs/superpowers/specs/2026-09-25-prompt-improve-design.md`.

---

## Context

O repositório `prompt-improve-beta` está vazio (só um `README.md` vazio, sem commits). A ideia é facilitar a melhoria de prompts e de mensagens de chat, como o recurso do Teams, só que de forma nativa e em qualquer app. O LLM é local por custo (Ollama), mas precisa ser plugável (Ollama Cloud ou APIs remotas). O público inicial é o próprio usuário e a equipe dele, e o projeto deve virar open source no futuro.

Decisões tomadas no brainstorming:
- O LLM é acessado por um cliente **compatível com OpenAI** (`/v1/chat/completions`, com streaming). O padrão é Ollama local (`http://localhost:11434/v1`).
- Fluxo: **preview**, depois **Substituir** (cola no app de origem) ou **Copiar**.
- Modal: **lista de ações configurável, agrupada por categoria, com um campo de instrução livre**.
- Ubuntu: suporte completo no X11. No Wayland, o atalho funciona via portal XDG e a app lê o texto do clipboard. Não há colagem automática: o botão "Substituir" vira só "Copiar".
- Stack: **Wails v3 + React + shadcn/ui**.

## Design

### Estrutura de arquivos
```
main.go                         # bootstrap Wails: app, tray, janela, atalho, single-instance
internal/config/config.go       # tipos + Load/Save/Default + validação
internal/config/defaults.go     # ações padrão (PT-BR) + YAML default
internal/llm/client.go          # cliente OpenAI-compat com streaming SSE
internal/improver/improver.go   # monta mensagens (system+user) e faz stream
internal/platform/platform.go   # interfaces Clipboard, KeySender; Session
internal/platform/capture.go    # Capture()/Paste() orquestrando clipboard+teclas
internal/platform/keys_darwin.go   # CGEventPost (cgo) + checagem de Acessibilidade
internal/platform/keys_windows.go  # SendInput via golang.org/x/sys/windows
internal/platform/keys_linux.go    # X11: exec `xdotool key --clearmodifiers ctrl+c/v`
internal/platform/session_linux.go # detecta Wayland (XDG_SESSION_TYPE/WAYLAND_DISPLAY)
internal/app/service.go         # ImproveService exposto ao frontend (bindings)
frontend/src/App.tsx            # modal
frontend/src/components/*       # ActionList, PreviewPane, Footer
frontend/src/lib/useImprove.ts  # estado + eventos do stream
```

### Config (`os.UserConfigDir()/prompt-improve/config.yaml`, criada com os padrões se não existir)
```yaml
hotkey: "CmdOrCtrl+Shift+Y"
provider:
  base_url: "http://localhost:11434/v1"
  api_key: ""            # a env PROMPT_IMPROVE_API_KEY tem precedência se definida
  model: "llama3.2"
  timeout_seconds: 60
max_input_chars: 20000
actions:
  - id: improve-prompt
    category: Prompt
    label: Melhorar prompt
    instruction: "Reescreva o prompt a seguir para um LLM: deixe claro objetivo, contexto, restrições e formato de saída. Responda apenas com o prompt reescrito."
  # + add-context, more-specific (Prompt); formal, casual, shorter, fix-grammar, to-english (Mensagem)
```
Validação: `base_url` e `model` não podem ser vazios, as ações precisam de `id` único, e `label` e `instruction` não podem ser vazios.

### Contratos principais (Go)
```go
// internal/llm
type Message struct{ Role, Content string }
type Client interface {
    Stream(ctx context.Context, msgs []Message, onChunk func(string)) error
}
func NewOpenAIClient(baseURL, apiKey, model string, timeout time.Duration) Client

// internal/improver
type Request struct{ Text, ActionID, FreeInstruction string }
type Improver struct{ /* cfg *config.Config; llm llm.Client */ }
func New(cfg *config.Config, c llm.Client) *Improver
func (i *Improver) Run(ctx context.Context, r Request, onChunk func(string)) error
// system prompt fixo: "Você reescreve textos. Responda SOMENTE com o texto final, sem aspas,
// sem explicações, no mesmo idioma do texto original salvo instrução contrária."
// instrução = action.instruction e/ou FreeInstruction (ambos concatenados se presentes)

// internal/platform
type Clipboard interface{ Text() (string, bool); SetText(string) bool }
type KeySender interface{ Copy() error; Paste() error }
type Session struct{ CanSimulateKeys bool; Reason string }
func DetectSession() Session
func Capture(cb Clipboard, ks KeySender, wait time.Duration) (text string, restore func(), err error)
func Paste(cb Clipboard, ks KeySender, text string, settle time.Duration) error
```
- `Capture`: salva o clipboard original, grava um sentinel, envia Copy e faz polling (a cada 20 ms, até `wait`=400 ms) esperando um valor diferente do sentinel. Se não mudar, retorna `ErrNoSelection`. O `restore()` devolve o original.
- `Paste`: grava o `text`, envia Paste, aguarda `settle`=300 ms e restaura o original.
- O clipboard do Wails v3 (`app.Clipboard`) é adaptado para a interface `Clipboard` em `internal/app`.

### Frontend e eventos
- Métodos Go expostos (bindings): `GetState() {text, actions[], canReplace, error}`, `Start(req) (requestId)`, `Cancel(requestId)`, `Replace(text)`, `Copy(text)`, `Close()`.
- Eventos Go→UI: `improve:chunk {id, delta}`, `improve:done {id}`, `improve:error {id, message}`, `selection:new {text, canReplace}`.
- UI: o `Command` (cmdk) lista as ações por categoria, com busca e navegação por setas. Um `Textarea` mostra o texto capturado (editável) e outro recebe a instrução livre. O preview vem em stream e, ao final, pode ser editado. O rodapé tem **Substituir** (⌘/Ctrl+Enter) e **Copiar** (⌘/Ctrl+Shift+C). `Esc` fecha e cancela.
- Janela: frameless, always-on-top, oculta ao iniciar, `HideOnEscape`, centralizada. No Windows, `HiddenOnTaskbar`. No macOS, `ActivationPolicyAccessory`.
- Substituir: esconde a janela, devolve o foco ao app anterior (no macOS, `app.Hide()`), espera cerca de 150 ms e chama `platform.Paste`.

### Erros
- O Ollama/LLM está inacessível: mostrar "Não foi possível conectar em `<base_url>`. O Ollama está rodando? (`ollama serve`)".
- HTTP 401/404: exibir a mensagem da API junto com a dica sobre `api_key`/`model`.
- Timeout: mensagem de timeout, com um botão "Tentar novamente".
- Nenhuma seleção: o modal abre com o texto vazio e editável, e o usuário pode colar ou digitar.
- Texto maior que `max_input_chars`: erro antes de chamar o LLM.
- macOS sem Acessibilidade: aviso no modal com instruções, e o fluxo segue com o texto do clipboard, sem Substituir.
- Falha ao registrar o atalho: notificação ou item no menu da tray, e log.

---

## Global Constraints
- Go 1.24+. A versão do Wails v3 fica fixada no `go.mod` (`github.com/wailsapp/wails/v3`), sem `latest` flutuante.
- `internal/config`, `internal/llm`, `internal/improver` e `internal/platform/capture.go` **não importam o Wails**.
- Sem `robotgo`. A simulação de teclas usa uma implementação própria por SO (`keys_*.go` com build tags).
- A UI e as mensagens para o usuário ficam em PT-BR. Identificadores e código ficam em inglês.
- A config fica em `os.UserConfigDir()/prompt-improve/config.yaml`. A API key pode vir da env `PROMPT_IMPROVE_API_KEY`.
- O clipboard original é sempre restaurado após a captura e a colagem, quando for texto.
- Identificador único do app: `dev.matrixia.prompt-improve`.

## Review Focus
1. **Nada selecionado:** o clipboard não muda. Deve retornar `ErrNoSelection`, restaurar o original, e o modal deve abrir vazio e editável (teste em `capture_test.go`).
2. **Ollama desligado (conexão recusada):** o erro deve ser legível, com dica e `base_url`, e nunca um stack trace (teste em `client_test.go` com uma porta fechada).
3. **Modal fechado no meio do stream:** o contexto deve ser cancelado, sem eventos `chunk` tardios nem goroutine vazando (teste em `improver_test.go` com cancel no meio do stream).
4. **Resposta do LLM com lixo:** "Aqui está o texto:", aspas ou blocos ```. Deve passar por uma limpeza leve com `strings.TrimSpace`, removendo aspas e cercas que envolvem todo o texto (teste em `improver_test.go`).
5. **Clipboard original não textual (imagem):** a app não deve sobrescrevê-lo com string vazia na restauração. Se `Text()` retornou `ok=false`, não restaura (teste em `capture_test.go`).

---

## Tasks

### Task 0: Configuração do ambiente e documentação base
**Arquivos:** `CLAUDE.md`, `.claude/settings.json`, `.mcp.json`, `.claude/agents/cross-platform-reviewer.md`, `.gitignore`, `docs/superpowers/specs/2026-09-25-prompt-improve-design.md`, `docs/superpowers/plans/2026-09-25-prompt-improve.md`
- [ ] Instalar o CLI do Wails v3: `go install github.com/wailsapp/wails/v3/cmd/wails3@latest`, depois anotar a versão instalada e rodar `wails3 doctor`.
- [ ] Criar o `CLAUDE.md` do projeto com: visão geral (2 a 3 linhas), stack, mapa de pacotes e responsabilidades, comandos (`wails3 dev`, `wails3 build`, `go test ./...`, `npm --prefix frontend test`, `wails3 generate bindings -ts`), regras (os pacotes `internal/*` não importam Wails, TDD, PT-BR na UI, build tags por SO, consultar o context7 para Wails v3/shadcn antes de usar APIs) e o checklist de verificação manual por SO.
- [ ] Criar o `.claude/settings.json` com permissões de allow para `go test`, `go build`, `go vet`, `gofmt`, `wails3 *`, `npm --prefix frontend *` e `npx shadcn@latest *`.
- [ ] Criar o `.mcp.json` com o **shadcn MCP** (`npx shadcn@latest mcp`), para os agentes consultarem e adicionarem componentes. O context7 já está habilitado globalmente.
- [ ] Criar o agente `.claude/agents/cross-platform-reviewer.md`: um revisor focado em código específico de SO (build tags, cgo no darwin, `x/sys/windows`, X11/Wayland, permissões do macOS, foco de janela). Deve ser usado na revisão das Tasks 5 e 6.
- [ ] Criar o `.gitignore` (Go, `frontend/node_modules`, `frontend/dist`, `build/bin`, `.DS_Store`).
- [ ] Gravar a seção Design deste plano como spec e copiar este plano para `docs/superpowers/plans/`.
- [ ] Commit: `chore: configura ambiente, CLAUDE.md e docs de design`.

Skills, MCP e agentes relevantes (já disponíveis, a referenciar no `CLAUDE.md`): `context7` (docs do Wails v3, shadcn, Tailwind), `superpowers:test-driven-development`, `superpowers:subagent-driven-development`, `superpowers:verification-before-completion`, `frontend-design` (visual do modal), `code-review` / `simplify` (revisão final). Novo: o shadcn MCP (projeto). Opcional, a critério do usuário: um plugin de LSP para Go (gopls), se estiver disponível no marketplace.

### Task 1: Scaffold Wails v3 + React/TS + shadcn (a app sobe na tray)
**Arquivos:** `main.go`, `go.mod`, `Taskfile.yml`/`build/` (do template), `frontend/**`
- [ ] Rodar `wails3 init -n prompt-improve -t react-ts` num diretório temporário e mover o conteúdo para a raiz do repositório (preservando `.git`, os docs e o `CLAUDE.md`).
- [ ] Ajustar o módulo Go para `github.com/gustavofreitas/prompt-improve` (confirmar com o usuário se o path for outro).
- [ ] Configurar o Tailwind, depois `npx shadcn@latest init` e `npx shadcn@latest add command textarea button scroll-area alert badge`.
- [ ] No `main.go`: `ActivationPolicyAccessory` (mac), `SingleInstance{UniqueID:"dev.matrixia.prompt-improve"}`, uma janela frameless, oculta, always-on-top e com `HideOnEscape`, e uma tray com os itens "Abrir", "Editar configuração", "Recarregar configuração" e "Sair".
- [ ] Verificar: `wails3 build` compila e `wails3 dev` mostra o ícone na tray e abre a janela pelo "Abrir".
- [ ] Commit: `feat: scaffold wails v3 com react, shadcn e tray`.

### Task 2: `internal/config` (TDD)
**Produz:** `type Config{Hotkey string; Provider Provider; MaxInputChars int; Actions []Action}`, `type Provider{BaseURL, APIKey, Model string; TimeoutSeconds int}`, `type Action{ID, Category, Label, Instruction string}`, `Default() *Config`, `Load(path string) (*Config, error)` (cria o arquivo com os padrões se ele não existir), `(*Config).Validate() error`, `(*Config).Action(id string) (Action, bool)`, `DefaultPath() (string, error)`.
- [ ] Testes (`config_test.go`), com os casos: arquivo inexistente cria o default e o retorna; o YAML válido é lido; `base_url` vazio falha; `id` duplicado falha; a env `PROMPT_IMPROVE_API_KEY` sobrescreve `api_key`; os campos omitidos recebem os defaults (timeout 60, max 20000).
- [ ] Rodar `go test ./internal/config/...` e ver falhar.
- [ ] Implementar `config.go` + `defaults.go` (8 ações padrão em PT-BR, 3 de Prompt e 5 de Mensagem).
- [ ] Rodar os testes e ver passar, depois `go vet ./...`.
- [ ] Commit: `feat(config): carrega e valida config.yaml com ações padrão`.

### Task 3: `internal/llm`, cliente OpenAI-compatível com streaming (TDD)
**Produz:** `Message`, `Client`, `NewOpenAIClient`, e os erros tipados `ErrUnreachable`, `*APIError{Status int; Message string}`.
- [ ] Testes com `httptest.Server` servindo SSE (`data: {"choices":[{"delta":{"content":"Ol"}}]}` … `data: [DONE]`), com os casos: os chunks chegam em ordem e são concatenados; o header `Authorization: Bearer` só vai quando há key; o body tem `model`, `messages` e `stream:true`; HTTP 401 retorna `*APIError` com a mensagem do JSON `error.message`; uma porta fechada retorna `ErrUnreachable` (**Review Focus 2**); o cancelamento do ctx encerra sem erro de leitura pendurado; linhas de keep-alive/vazias são ignoradas.
- [ ] Ver falhar, implementar com `net/http` + `bufio.Scanner` (buffer de 1 MB) e ver passar.
- [ ] Commit: `feat(llm): cliente openai-compatível com streaming SSE`.

### Task 4: `internal/improver` (TDD)
**Consome:** `config.Config`, `config.Action`, `llm.Client`. **Produz:** `Request`, `Improver`, `New`, `Run`, `ErrEmptyText`, `ErrTooLong`, `ErrUnknownAction`, `Clean(string) string`.
- [ ] Testes com um `fakeClient` que registra as mensagens e emite chunks, com os casos: com uma ação, a mensagem de sistema contém o system prompt fixo e a user message contém a instrução da ação + o texto delimitado (`<texto>…</texto>`); só com a instrução livre, funciona; com ação + instrução livre, ambas aparecem; texto vazio retorna `ErrEmptyText`; texto maior que o máximo retorna `ErrTooLong`; ação inexistente retorna `ErrUnknownAction`; um cancel no meio do stream faz `Run` retornar `context.Canceled`, sem chamadas a `onChunk` depois disso (**Review Focus 3**); `Clean` remove as cercas ``` e as aspas que envolvem todo o texto e faz o trim (**Review Focus 4**).
- [ ] Ver falhar, implementar e ver passar.
- [ ] Commit: `feat(improver): monta prompt por ação e instrução livre`.

### Task 5: `internal/platform`, captura e colagem + teclas por SO
**Produz:** os contratos listados em "Contratos principais". **Revisão extra:** agente `cross-platform-reviewer`.
- [ ] Testes (`capture_test.go`) com `fakeClipboard` e `fakeKeys` (o Copy simula o app gravando o texto selecionado), com os casos: a seleção é capturada e o `restore()` volta ao original; nada selecionado retorna `ErrNoSelection` e restaura (**Review Focus 1**); clipboard original não textual (`ok=false`) não é sobrescrito na restauração (**Review Focus 5**); `Paste` grava o texto, chama Paste e restaura depois do `settle`; um erro do `KeySender` é propagado e o clipboard é restaurado.
- [ ] Implementar `capture.go` e ver passar.
- [ ] `keys_darwin.go`: cgo com `CGEventCreateKeyboardEvent` (keycode 8=C, 9=V, flag `kCGEventFlagMaskCommand`) + `AXIsProcessTrustedWithOptions` exposto como `func AccessibilityTrusted(prompt bool) bool`.
- [ ] `keys_windows.go`: `SendInput` com `VK_CONTROL` + `'C'`/`'V'` via `golang.org/x/sys/windows` (`NewLazySystemDLL("user32.dll")`).
- [ ] `keys_linux.go` + `session_linux.go`: se for Wayland, `CanSimulateKeys=false`. No X11, verifica se o `xdotool` está no PATH (se não estiver, `CanSimulateKeys=false` com o motivo "instale xdotool") e executa `xdotool key --clearmodifiers ctrl+c`.
- [ ] Verificar: `GOOS=windows go vet ./internal/platform/...` e `GOOS=linux go vet ./internal/platform/...` compilam no mac (o darwin compila com cgo nativamente). `go test ./internal/platform/...` passa.
- [ ] Commit: `feat(platform): captura/colagem via clipboard e teclas por SO`.

### Task 6: `internal/app` + wiring no `main.go` (atalho → modal → substituir)
**Consome:** as Tasks 2 a 5. **Produz:** `ImproveService` com `GetState`, `Start`, `Cancel`, `Replace`, `Copy`, `Close` e os eventos `improve:*` e `selection:new`. **Revisão extra:** `cross-platform-reviewer`.
- [ ] Testes de `ImproveService` com um `Emitter` fake (interface `Emit(name string, data any)`) e um improver fake, com os casos: `Start` emite chunks e `done` com o mesmo `id`; `Start` seguido de outro `Start` cancela o anterior; `Cancel` interrompe; `Replace` com `canReplace=false` retorna erro; um erro do improver vira `improve:error` com mensagem PT-BR mapeada de `ErrUnreachable`/`APIError`/`ErrTooLong`.
- [ ] Implementar `service.go` (adapters `wailsClipboard` e `wailsEmitter` isolados).
- [ ] No `main.go`: carregar a config (se falhar, abrir a janela com um erro); `app.GlobalShortcut.Register(cfg.Hotkey, onHotkey)`. O `onHotkey` faz: `platform.Capture` (se `CanSimulateKeys`) ou lê o clipboard, depois `Emit("selection:new")`, e por fim `window.Center(); Show(); Focus()`. Também faz o `OnSecondInstanceLaunch`, tratando o arg `--trigger` da mesma forma que o atalho (fallback manual no Wayland/GNOME). No mac, se `!AccessibilityTrusted(true)`, o `canReplace` fica falso e é exibido um aviso. Por fim, os itens de tray "Editar configuração" (abre o arquivo com o app padrão) e "Recarregar".
- [ ] Rodar `wails3 generate bindings -ts`, depois `go test ./...` e `wails3 build`.
- [ ] Commit: `feat(app): conecta atalho global, captura e serviço de melhoria`.

### Task 7: Modal no frontend (React + shadcn)
**Consome:** os bindings gerados na Task 6. Usar a skill `frontend-design` e o shadcn MCP.
- [ ] Criar o hook `useImprove.ts`: assina `selection:new` e `improve:*`, mantém `{text, actions, canReplace, status: idle|streaming|done|error, output, error}` e ignora eventos com `id` antigo.
- [ ] Testes com Vitest + Testing Library (mock dos bindings/eventos), com os casos: renderiza as ações agrupadas por categoria; Enter numa ação chama `Start` com `actionId`; a instrução livre e Enter chamam `Start` com `freeInstruction`; os chunks aparecem no preview; `canReplace=false` esconde "Substituir"; um erro mostra `Alert` com "Tentar novamente"; `Esc` chama `Cancel` + `Close`.
- [ ] Implementar `App.tsx`, `ActionList` (shadcn `Command`), `PreviewPane` (`Textarea` editável após `done`), `Footer` (Substituir ⌘/Ctrl+Enter, Copiar ⌘/Ctrl+Shift+C) e o layout compacto (~560×520), respeitando o tema claro/escuro do SO.
- [ ] Rodar `npm --prefix frontend test` e `wails3 build`.
- [ ] Commit: `feat(ui): modal de melhoria com ações, instrução livre e preview`.

### Task 8: CI multiplataforma + README
**Arquivos:** `.github/workflows/ci.yml`, `README.md`
- [ ] Criar um workflow com matrix `macos-latest`, `windows-latest` e `ubuntu-latest`, com os passos: setup Go/Node, instalação das deps do Linux (`libgtk-3-dev libwebkit2gtk-4.1-dev`), `go test ./...`, `npm ci && npm test` no frontend e `wails3 build`, publicando os binários como artifacts.
- [ ] Escrever o README em PT-BR: o que é, instalação do Ollama (`ollama pull llama3.2`), config de exemplo (Ollama local, Ollama Cloud e OpenAI), permissão de Acessibilidade no macOS, `xdotool` no X11, atalho `--trigger` no GNOME/Wayland e como adicionar ações.
- [ ] Commit: `ci: build e testes em macOS, Windows e Ubuntu`.

### Task 9: Release e instalação via npm / script
**Arquivos:** `.github/workflows/release.yml`, `npm/package.json`, `npm/src/cli.ts`, `npm/src/install.ts`, `npm/src/platform.ts`, `npm/test/*.test.ts`, `scripts/install.sh`, `scripts/install.ps1`, `README.md`
**Decisão:** o app continua em Wails. A distribuição é feita por um **wrapper npm em TypeScript** (padrão esbuild/biome) que baixa do GitHub Release o artefato certo. Sem assinatura de código por enquanto: os downloads por npm/curl não recebem quarentena nem Mark-of-the-Web.
- [ ] Criar o `release.yml`, disparado por tag `v*`, com matrix mac (universal), windows-amd64, linux-amd64 e linux-arm64. Ele roda `wails3 package` e publica no GitHub Release os arquivos `prompt-improve-darwin-universal.app.zip`, `prompt-improve-windows-amd64.exe`, `prompt-improve-linux-amd64` e `prompt-improve-linux-arm64`, junto com o `checksums.txt` (SHA-256).
- [ ] `npm/src/platform.ts`: `assetName(platform: NodeJS.Platform, arch: string): string` (lança um erro com mensagem PT-BR se a combinação não for suportada) e `installDir(platform): string` (mac: `~/Applications/Prompt Improve.app`; win: `%LOCALAPPDATA%\prompt-improve\`; linux: `~/.local/share/prompt-improve/`).
- [ ] `npm/src/install.ts` (`postinstall`): baixa o asset da versão igual à do `package.json`, confere o SHA-256 contra o `checksums.txt`, extrai/copia para o `installDir` e faz `chmod +x`. Respeita `PROMPT_IMPROVE_SKIP_DOWNLOAD=1`.
- [ ] `npm/src/cli.ts` (`bin: prompt-improve`) com os subcomandos:
  - `start`: inicia destacado (mac: `open -a`);
  - `stop`;
  - `trigger`: repassa `--trigger`;
  - `config`: abre o YAML;
  - `autostart on|off`: mac usa LaunchAgent plist, win usa a chave `HKCU\...\Run` via `reg`, linux usa `~/.config/autostart/*.desktop`;
  - `doctor`: verifica o binário, o Ollama em `base_url`, `xdotool`/Wayland e a Acessibilidade no mac.
- [ ] Testes com Vitest, com os casos: `assetName` para cada combinação e erro nas não suportadas; um checksum inválido aborta a instalação e remove o arquivo parcial; o conteúdo gerado do plist, do `.desktop` e do comando `reg` para o autostart; `doctor` com o Ollama fora do ar informa a dica `ollama serve`.
- [ ] Criar o `scripts/install.sh` (mac/linux) e o `install.ps1` (windows), com a mesma lógica do `install.ts`, para quem não tem Node.
- [ ] Adicionar ao README a seção "Instalação": `npm i -g prompt-improve && prompt-improve start`, a alternativa via `curl … | sh`, a permissão de Acessibilidade e o `prompt-improve doctor`.
- [ ] Adicionar à tray o item "Iniciar com o sistema", que reaproveita a mesma lógica do autostart (implementada em Go em `internal/autostart`, testada pelo conteúdo gerado).
- [ ] Verificar: `npm --prefix npm test`; `npm pack` seguido de instalar o tarball localmente com `PROMPT_IMPROVE_SKIP_DOWNLOAD=1`, confirmando que `prompt-improve doctor` roda.
- [ ] Commit: `feat(dist): release multiplataforma e instalador via npm`.

---

## Verificação end-to-end
1. `go test ./... && npm --prefix frontend test` sem falhas.
2. `wails3 build` gera o binário, e a CI fica verde nas 3 plataformas.
3. Manual no macOS (máquina atual), com o Ollama rodando:
   - selecionar um texto no Notes, apertar ⌘⇧Y, o modal abre com o texto; escolher "Mais formal", o preview aparece em stream; ⌘Enter substitui o texto no Notes e o clipboard volta ao valor anterior.
   - usar a instrução livre ("traduza para espanhol") e depois Copiar.
   - com o Ollama parado, deve aparecer a mensagem de erro com a dica `ollama serve`.
   - sem seleção, o modal abre vazio e editável.
   - fechar com Esc durante o stream não pode causar erro no log.
4. Windows e Ubuntu X11/Wayland: mesmo checklist (manual, pelo usuário ou pela equipe). No Wayland, usar `prompt-improve --trigger` como atalho do GNOME e confirmar que só aparece "Copiar".

## Execução
Subagent-driven (`superpowers:subagent-driven-development`): um implementador novo por task e revisão depois de cada uma, com o `cross-platform-reviewer` nas Tasks 5 e 6. Ordem sequencial de 0 a 9. As Tasks 2, 3 e 5 (a parte de `capture.go`) são independentes entre si e podem rodar em paralelo depois da Task 1.
