# Prompt Improve: spec de design

> Extraído do plano `docs/superpowers/plans/2026-09-25-prompt-improve.md` (seções Context, Design, Global Constraints e Review Focus), na Task 0.

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

## Decisões de pré-execução

- R1: internal/platform produz `NewKeySender() KeySender`, `DetectSession() Session` e `AccessibilityTrusted(prompt bool) bool` em todos os SOs (não-darwin retorna true); no darwin, CanSimulateKeys = AccessibilityTrusted(false).
- R2: `Improver.Run` mantém a assinatura; o ImproveService acumula os chunks e emite `improve:done {id, text}` com `improver.Clean(total)`; a UI substitui o preview por `text` no done.
- R3: Clean trata apenas trim, cercas ``` e aspas envolventes; preâmbulos são evitados pelo system prompt.
- Distribuição: wrapper npm em TypeScript baixa o binário do GitHub Release (Task 9); sem assinatura de código por enquanto.
