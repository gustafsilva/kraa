# Camada de testes (unitários + E2E) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar backend, frontend e CLI npm com testes unitários/integração sólidos e gate de cobertura na CI, e criar uma suíte E2E (Playwright) que roda o backend Go real em Wails *server mode* contra um LLM fake.

**Architecture:** A lógica hoje presa em closures do `main.go` (troca de atalho com rollback, savers, fila de segunda instância, fallback de config) vai para tipos testáveis em `internal/app`. Um pacote `internal/llmfake` serve um OpenAI-compatível determinístico usado pelos testes Go e, via `cmd/llmfake`, pelo Playwright. Um segundo entrypoint `main_server.go` (`//go:build server`) sobe o mesmo `ImproveService` com fakes em memória (`internal/e2e`) e endpoints `/__e2e/*` para o Playwright dirigir captura, colagem e sessão.

**Tech Stack:** Go 1.25 (`testing/synctest`), Wails v3 `v3.0.0-beta.26` (tag `server`), React 18 + Vitest 5 + `@vitest/coverage-v8`, ESLint 9 (flat config), `@playwright/test` 1.59.1, GitHub Actions.

**Spec:** não há spec separada — este plano nasce da exploração registrada na conversa de 2026-09-26/27 (resumo na seção "Contexto verificado" abaixo). Referências: `CLAUDE.md`, `BACKLOG.md` ("Ajustar camada de testes (unitários e e2e)").

## Contexto verificado (não re-derivar)

- Cobertura medida antes do plano: Go `internal/...` **86.3%** (improver 100, app 89.7, config 86.7, autostart 86.7, llm 78.9, platform 68.5); frontend **92.38% stmts / 87.15% branches / 90.09% funcs / 92.8% lines**; npm **84.66% / 82.6% / 71.18% / 86.12%**.
- Wails beta.26 server mode (confirmado no modcache e rodando o binário):
  - `go build -tags server .` compila; no Linux compila **sem cgo** (`GOOS=linux CGO_ENABLED=0 go build -tags server .` ok) — arquivos GTK têm `!server`.
  - Serve frontend em `/`, bindings em `POST /wails/runtime`, eventos por WebSocket `/wails/events`, `GET /health` → `{"status":"ok"}`. Porta/host por `WAILS_SERVER_PORT`/`WAILS_SERVER_HOST`.
  - `AssetOptions.Middleware` (`func(next http.Handler) http.Handler`) envolve o asset server, que atende `/` (inclui o runtime).
  - No-ops: clipboard (`SetText` → false, "Copiar" falha), janelas, bandeja, diálogos. `GlobalShortcut.Register` **sempre retorna erro**. Single-instance `notify` retorna erro. `events.Common.ApplicationStarted` **não é mapeado** (sem `events_common_server`), então o handler de startup não roda.
  - `main.go` atual chama `platform.AccessibilityTrusted(true)` no macOS mesmo em server mode (abre prompt do sistema).
- Probe manual (binário server + LLM fake Python + Playwright) confirmou: modal carrega modelos do fake, stream chega na tela, `SetModel` grava `model: "fake-b"` no `config.yaml`, `/?view=profile` carrega. Problemas vistos: "Copiar" falha (clipboard no-op) e, após trocar o modelo, aparece o aviso falso "Não foi possível registrar o atalho … Nenhum atalho ativo".
- `config.Load` completa campos omitidos com os defaults; `config.DefaultPath()` = `os.UserConfigDir()/kraa/config.yaml` (macOS `$HOME/Library/Application Support`, Linux `$XDG_CONFIG_HOME` ou `$HOME/.config`, Windows `%APPDATA%`).

## Global Constraints

- Go `go 1.25.0` (go.mod); Wails fixo em `v3.0.0-beta.26`; `@wailsio/runtime` fixo `3.0.0-beta.26`.
- `internal/config`, `internal/llm`, `internal/improver`, `internal/platform/capture.go`, **`internal/llmfake` e `internal/e2e` não importam o Wails**. Só `main.go`, `main_server.go` e `internal/app` podem importar `github.com/wailsapp/wails/v3`.
- Textos de UI/erros em **PT-BR**; identificadores e código em inglês; comentários seguem o estilo do arquivo (inglês no Go de `internal/app`/`main.go`).
- Código específico de SO usa build tags, nunca `if runtime.GOOS` novo espalhado.
- Linux: `go build`/`go vet`/`go test` do desktop exigem `-tags gtk3`. Build E2E: `-tags server` (sem `gtk3`).
- TDD: teste primeiro, ver falhar, implementar, ver passar (`superpowers:test-driven-development`).
- Antes de usar API do Wails v3, ESLint ou Playwright que não esteja escrita neste plano, consultar a doc via **context7**.
- O binário `-tags server` e os endpoints `/__e2e/*` **nunca** entram em release (`release.yml` não usa a tag).
- `go test ./...`, `npm --prefix frontend test` e `npm --prefix npm test` passam antes de cada commit.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **Rollback do atalho no reload**: novo atalho rejeitado → volta ao anterior com aviso "Mantido X"; se o anterior também falhar → "Nenhum atalho ativo". Testado na Task 2 (`TestReloadNewHotkeyRejectedKeepsPrevious`, `TestReloadBothHotkeysRejected`).
2. **Segunda instância chegando antes do handler estar pronto** (`--trigger` cedo no boot) não pode se perder. Testado na Task 2 (`TestLaunchQueueQueuesUntilHandlerAndDrainsOnce`).
3. **Cancelamento no meio do stream** (Esc/Fechar): nenhum evento depois do cancelamento e o servidor vê a conexão cancelada. Testado na Task 7 (`TestIntegrationCloseMidStreamCancelsUpstream`) e Task 9 (`cancel.spec.ts`).
4. **Config YAML inválido no boot**: app sobe com defaults e mostra "Erro ao carregar a configuração…", sem crash. Testado na Task 2 (`TestLoadStartupConfigFallsBackOnInvalidYAML`) e Task 3 (`TestLoad_InvalidYAMLReturnsPTBRError`).
5. **Estado vazando entre testes** (mocks do frontend com `mockImplementation` persistente; backend E2E compartilhado entre specs). Coberto pelo reset global da Task 4 (`mockReset` em `setup.ts`) e pelo `resetAll()` da Task 9 (reescreve `config.yaml` + `/__e2e/reset` que recarrega).

## Mapa de arquivos

| Arquivo | Task | Responsabilidade |
|---|---|---|
| `internal/llmfake/llmfake.go` (+`_test`) | 1 | Servidor OpenAI fake (`/v1/chat/completions` SSE, `/v1/models`, `/__control/*`). |
| `cmd/llmfake/main.go` | 1 | Binário do fake para o Playwright. |
| `internal/app/bootstrap.go` (+`_test`) | 2 | `LoadConfig`, `NewRunner`, `LoadStartupConfig`. |
| `internal/app/reloader.go` (+`_test`) | 2 | `Shortcuts`, `Reloader` (reload, rollback de atalho, savers), `HotkeyWarning`. |
| `internal/app/launch.go` (+`_test`) | 2 | `LaunchQueue`, `TriggerArg`, `StartupAction`. |
| `assets.go` | 2 | `//go:embed all:frontend/dist` compartilhado pelos dois entrypoints. |
| `main.go` | 2 | Só wiring desktop (`//go:build !server` entra na Task 8). |
| `internal/llm/client_test.go`, `internal/config/*_test.go`, `internal/platform/keys_linux.go` (+`keys_linux_test.go`), `internal/autostart/autostart.go` (+test), `internal/app/service_test.go`, `internal/autostart/toggle_test.go` | 3 | Lacunas do backend e remoção de `sleep`. |
| `frontend/package.json`, `frontend/eslint.config.js`, `frontend/vitest.config.ts`, `frontend/src/test/*`, `frontend/src/**/*.test.tsx` (cabeçalhos) | 4 | Cobertura, typecheck, lint, mocks centralizados e tipados. |
| `frontend/src/**` testes novos, `frontend/src/view.ts` (+test), `frontend/src/main.tsx` | 5 | Lacunas do frontend, warnings `act()`, split do `App.test.tsx`. |
| `npm/package.json`, `npm/vitest.config.ts`, `npm/test/*` | 6 | Lacunas e cobertura da CLI npm. |
| `internal/app/integration_test.go` | 7 | Service → improver → llm → llmfake. |
| `internal/e2e/e2e.go` (+`_test`), `main_server.go`, `main.go` (tag) | 8 | Fakes em memória + `/__e2e/*` + entrypoint server. |
| `e2e/**` | 9 | Suíte Playwright. |
| `.github/workflows/ci.yml`, `.gitignore`, `CLAUDE.md`, `CONTRIBUTING.md`, `site/src/content/docs/contribuir/testes.mdx`, `CHANGELOG.md`, `BACKLOG.md` | 10 | Gates, job E2E e documentação (inclui limitações). |

## Ondas de execução (sub-agentes em paralelo)

Os arquivos de cada onda são disjuntos; rode cada task num **worktree próprio** (`Agent` com `isolation: "worktree"`) e faça merge na branch ao fim da onda, rodando os três comandos de teste depois de cada merge.

| Onda | Tasks em paralelo | Depende de |
|---|---|---|
| 1 | 1, 2, 3, 4, 6 | — |
| 2 | 5, 7, 8 | 5←4, 7←1, 8←2 |
| 3 | 9 | 1, 8 |
| 4 | 10 | todas |

Conflitos possíveis a vigiar no merge da onda 1: Task 2 e Task 3 tocam `internal/app` (2 cria arquivos novos; só 3 edita `service_test.go`). Task 2 **não** renomeia fakes de `service_test.go`; Task 3 **não** cria arquivos em `internal/app` além de editar `service_test.go`.

---

### Task 1: LLM fake compartilhado (`internal/llmfake` + `cmd/llmfake`)

**Files:**
- Create: `internal/llmfake/llmfake.go`
- Create: `internal/llmfake/llmfake_test.go`
- Create: `cmd/llmfake/main.go`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `llmfake.New(models ...string) *Server` (implementa `http.Handler`)
  - `(*Server).SetScenario(Scenario)`, `(*Server).SetModels(...string)`, `(*Server).Requests() []Request`, `(*Server).Reset()`
  - `type Scenario struct { Chunks []string \`json:"chunks"\`; ChunkDelayMS int \`json:"chunkDelayMs"\`; Status int \`json:"status"\`; Message string \`json:"message"\`; Hang bool \`json:"hang"\`; ModelsStatus int \`json:"modelsStatus"\`; ModelsMessage string \`json:"modelsMessage"\` }`
  - `type Request struct { Model string \`json:"model"\`; Messages []Message \`json:"messages"\`; Canceled bool \`json:"canceled"\` }`, `type Message struct { Role, Content string }` (tags `role`, `content`)
  - `var DefaultChunks = []string{"Texto ", "melhorado ", "pelo ", "fake."}`
  - Endpoints de controle: `POST /__control/scenario` (corpo `Scenario`), `POST /__control/models` (corpo `[]string`), `GET /__control/requests`, `POST /__control/reset`.
  - `go run ./cmd/llmfake -addr 127.0.0.1:18766` com modelos `fake-a`, `fake-b`.

- [ ] **Step 1: Escrever os testes que falham**

```go
package llmfake_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gustavofreitas/kraa/internal/llmfake"
)

func postChat(t *testing.T, url, model string) *http.Response {
	t.Helper()
	body := `{"model":"` + model + `","stream":true,"messages":[{"role":"user","content":"oi"}]}`
	resp, err := http.Post(url+"/v1/chat/completions", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

func TestChatStreamsDefaultChunksThenDone(t *testing.T) {
	srv := httptest.NewServer(llmfake.New("fake-a"))
	defer srv.Close()

	resp := postChat(t, srv.URL, "fake-a")
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	got := string(raw)

	if ct := resp.Header.Get("Content-Type"); ct != "text/event-stream" {
		t.Fatalf("Content-Type = %q", ct)
	}
	for _, c := range llmfake.DefaultChunks {
		b, _ := json.Marshal(c)
		if !strings.Contains(got, `"content":`+string(b)) {
			t.Errorf("stream sem o chunk %q:\n%s", c, got)
		}
	}
	if !strings.HasSuffix(strings.TrimSpace(got), "data: [DONE]") {
		t.Errorf("stream não termina com [DONE]:\n%s", got)
	}
}

func TestChatRecordsRequest(t *testing.T) {
	fake := llmfake.New("fake-a")
	srv := httptest.NewServer(fake)
	defer srv.Close()

	resp := postChat(t, srv.URL, "fake-a")
	io.Copy(io.Discard, resp.Body)
	resp.Body.Close()

	reqs := fake.Requests()
	if len(reqs) != 1 || reqs[0].Model != "fake-a" || reqs[0].Messages[0].Content != "oi" || reqs[0].Canceled {
		t.Fatalf("Requests() = %+v", reqs)
	}
}

func TestChatErrorStatusReturnsOpenAIErrorBody(t *testing.T) {
	fake := llmfake.New()
	fake.SetScenario(llmfake.Scenario{Status: 401, Message: "chave inválida"})
	srv := httptest.NewServer(fake)
	defer srv.Close()

	resp := postChat(t, srv.URL, "x")
	defer resp.Body.Close()
	var body struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	json.NewDecoder(resp.Body).Decode(&body)
	if resp.StatusCode != 401 || body.Error.Message != "chave inválida" {
		t.Fatalf("status=%d body=%+v", resp.StatusCode, body)
	}
}

func TestChatHangMarksCanceledWhenClientGoesAway(t *testing.T) {
	fake := llmfake.New()
	fake.SetScenario(llmfake.Scenario{Chunks: []string{"parcial"}, Hang: true})
	srv := httptest.NewServer(fake)
	defer srv.Close()

	ctx, cancel := context.WithCancel(context.Background())
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, srv.URL+"/v1/chat/completions",
		strings.NewReader(`{"model":"m","messages":[]}`))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	buf := make([]byte, 64)
	resp.Body.Read(buf) // primeiro chunk chegou
	cancel()
	resp.Body.Close()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if r := fake.Requests(); len(r) == 1 && r[0].Canceled {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("pedido não marcado como cancelado: %+v", fake.Requests())
}

func TestModelsListsConfiguredModels(t *testing.T) {
	srv := httptest.NewServer(llmfake.New("fake-a", "fake-b"))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/v1/models")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var body struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	json.NewDecoder(resp.Body).Decode(&body)
	if len(body.Data) != 2 || body.Data[0].ID != "fake-a" || body.Data[1].ID != "fake-b" {
		t.Fatalf("models = %+v", body.Data)
	}
}

func TestModelsErrorStatus(t *testing.T) {
	fake := llmfake.New("fake-a")
	fake.SetScenario(llmfake.Scenario{ModelsStatus: 500, ModelsMessage: "falhou"})
	srv := httptest.NewServer(fake)
	defer srv.Close()

	resp, _ := http.Get(srv.URL + "/v1/models")
	defer resp.Body.Close()
	if resp.StatusCode != 500 {
		t.Fatalf("status = %d", resp.StatusCode)
	}
}

func TestControlEndpointsDriveTheFake(t *testing.T) {
	fake := llmfake.New("fake-a")
	srv := httptest.NewServer(fake)
	defer srv.Close()

	sc, _ := json.Marshal(llmfake.Scenario{Chunks: []string{"x"}})
	if resp, _ := http.Post(srv.URL+"/__control/scenario", "application/json", bytes.NewReader(sc)); resp.StatusCode != http.StatusNoContent {
		t.Fatalf("scenario status = %d", resp.StatusCode)
	}
	resp := postChat(t, srv.URL, "fake-a")
	raw, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if !strings.Contains(string(raw), `"content":"x"`) {
		t.Fatalf("cenário não aplicado: %s", raw)
	}

	r, _ := http.Get(srv.URL + "/__control/requests")
	var reqs []llmfake.Request
	json.NewDecoder(r.Body).Decode(&reqs)
	r.Body.Close()
	if len(reqs) != 1 {
		t.Fatalf("requests = %+v", reqs)
	}

	http.Post(srv.URL+"/__control/reset", "application/json", nil)
	if len(fake.Requests()) != 0 {
		t.Fatal("reset não limpou os pedidos")
	}
	resp = postChat(t, srv.URL, "fake-a")
	raw, _ = io.ReadAll(resp.Body)
	resp.Body.Close()
	if !strings.Contains(string(raw), `"content":"Texto "`) {
		t.Fatalf("reset não voltou ao cenário padrão: %s", raw)
	}

	models, _ := json.Marshal([]string{"z"})
	http.Post(srv.URL+"/__control/models", "application/json", bytes.NewReader(models))
	mr, _ := http.Get(srv.URL + "/v1/models")
	raw, _ = io.ReadAll(mr.Body)
	mr.Body.Close()
	if !strings.Contains(string(raw), `"id":"z"`) {
		t.Fatalf("models não trocados: %s", raw)
	}
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `go test ./internal/llmfake/`
Expected: FAIL — `package github.com/gustavofreitas/kraa/internal/llmfake is not in std` / `undefined: llmfake.New`.

- [ ] **Step 3: Implementar `internal/llmfake/llmfake.go`**

```go
// Package llmfake is a deterministic OpenAI-compatible server for tests:
// POST /v1/chat/completions (SSE) and GET /v1/models, plus /__control/*
// endpoints so an out-of-process test (the Playwright suite) can script it.
// It does not import Wails.
package llmfake

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"
)

// DefaultChunks is what a chat request streams when no scenario is set.
var DefaultChunks = []string{"Texto ", "melhorado ", "pelo ", "fake."}

// Scenario scripts the next responses. Zero values mean "default".
type Scenario struct {
	Chunks        []string `json:"chunks"`
	ChunkDelayMS  int      `json:"chunkDelayMs"`
	Status        int      `json:"status"`  // != 0 && != 200: chat answers this status with an OpenAI error body
	Message       string   `json:"message"` // error message for Status
	Hang          bool     `json:"hang"`    // after the chunks, block until the client cancels
	ModelsStatus  int      `json:"modelsStatus"`
	ModelsMessage string   `json:"modelsMessage"`
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Request is a recorded chat request.
type Request struct {
	Model    string    `json:"model"`
	Messages []Message `json:"messages"`
	Canceled bool      `json:"canceled"`
}

type Server struct {
	mu            sync.Mutex
	defaultModels []string
	models        []string
	scenario      Scenario
	requests      []Request
}

func New(models ...string) *Server {
	return &Server{defaultModels: models, models: append([]string(nil), models...)}
}

func (s *Server) SetScenario(sc Scenario) { s.mu.Lock(); s.scenario = sc; s.mu.Unlock() }

func (s *Server) SetModels(models ...string) {
	s.mu.Lock()
	s.models = append([]string(nil), models...)
	s.mu.Unlock()
}

func (s *Server) Requests() []Request {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]Request(nil), s.requests...)
}

// Reset restores the default scenario and models and clears recorded requests.
func (s *Server) Reset() {
	s.mu.Lock()
	s.scenario, s.requests = Scenario{}, nil
	s.models = append([]string(nil), s.defaultModels...)
	s.mu.Unlock()
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.Method == http.MethodPost && r.URL.Path == "/v1/chat/completions":
		s.chat(w, r)
	case r.Method == http.MethodGet && r.URL.Path == "/v1/models":
		s.listModels(w)
	case r.Method == http.MethodPost && r.URL.Path == "/__control/scenario":
		var sc Scenario
		if err := json.NewDecoder(r.Body).Decode(&sc); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		s.SetScenario(sc)
		w.WriteHeader(http.StatusNoContent)
	case r.Method == http.MethodPost && r.URL.Path == "/__control/models":
		var models []string
		if err := json.NewDecoder(r.Body).Decode(&models); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		s.SetModels(models...)
		w.WriteHeader(http.StatusNoContent)
	case r.Method == http.MethodGet && r.URL.Path == "/__control/requests":
		writeJSON(w, http.StatusOK, s.Requests())
	case r.Method == http.MethodPost && r.URL.Path == "/__control/reset":
		s.Reset()
		w.WriteHeader(http.StatusNoContent)
	default:
		http.NotFound(w, r)
	}
}

func (s *Server) listModels(w http.ResponseWriter) {
	s.mu.Lock()
	sc, models := s.scenario, append([]string(nil), s.models...)
	s.mu.Unlock()
	if sc.ModelsStatus != 0 && sc.ModelsStatus != http.StatusOK {
		writeError(w, sc.ModelsStatus, sc.ModelsMessage)
		return
	}
	type model struct {
		ID     string `json:"id"`
		Object string `json:"object"`
	}
	data := make([]model, len(models))
	for i, m := range models {
		data[i] = model{ID: m, Object: "model"}
	}
	writeJSON(w, http.StatusOK, map[string]any{"object": "list", "data": data})
}

func (s *Server) chat(w http.ResponseWriter, r *http.Request) {
	var req Request
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	s.mu.Lock()
	sc := s.scenario
	s.requests = append(s.requests, req)
	idx := len(s.requests) - 1
	s.mu.Unlock()

	if sc.Status != 0 && sc.Status != http.StatusOK {
		writeError(w, sc.Status, sc.Message)
		return
	}
	chunks := sc.Chunks
	if chunks == nil {
		chunks = DefaultChunks
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.WriteHeader(http.StatusOK)
	flusher, _ := w.(http.Flusher)
	ctx := r.Context()
	canceled := func() {
		s.mu.Lock()
		if idx < len(s.requests) {
			s.requests[idx].Canceled = true
		}
		s.mu.Unlock()
	}

	for _, c := range chunks {
		payload, _ := json.Marshal(map[string]any{
			"choices": []map[string]any{{"delta": map[string]string{"content": c}}},
		})
		if _, err := w.Write([]byte("data: " + string(payload) + "\n\n")); err != nil {
			canceled()
			return
		}
		if flusher != nil {
			flusher.Flush()
		}
		select {
		case <-ctx.Done():
			canceled()
			return
		case <-time.After(time.Duration(sc.ChunkDelayMS) * time.Millisecond):
		}
	}
	if sc.Hang {
		<-ctx.Done()
		canceled()
		return
	}
	w.Write([]byte("data: [DONE]\n\n"))
	if flusher != nil {
		flusher.Flush()
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]any{"error": map[string]string{"message": msg}})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `go test -race ./internal/llmfake/`
Expected: PASS.

- [ ] **Step 5: Criar `cmd/llmfake/main.go`**

```go
// Command llmfake serves internal/llmfake on a TCP address for the
// Playwright suite (e2e/playwright.config.ts starts it as a webServer).
package main

import (
	"flag"
	"log"
	"net/http"

	"github.com/gustavofreitas/kraa/internal/llmfake"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:18766", "endereço de escuta")
	flag.Parse()
	log.Printf("llmfake ouvindo em http://%s", *addr)
	log.Fatal(http.ListenAndServe(*addr, llmfake.New("fake-a", "fake-b")))
}
```

Run: `go build -o /dev/null ./cmd/llmfake && go vet ./internal/llmfake ./cmd/llmfake`
Expected: sem saída, exit 0.

- [ ] **Step 6: Commit**

```bash
git add internal/llmfake cmd/llmfake
git commit -m "test: servidor OpenAI fake compartilhado (llmfake)"
```

---

### Task 2: Extrair a lógica do `main.go` para `internal/app`

**Files:**
- Create: `internal/app/bootstrap.go`, `internal/app/bootstrap_test.go`
- Create: `internal/app/reloader.go`, `internal/app/reloader_test.go`
- Create: `internal/app/launch.go`, `internal/app/launch_test.go`
- Create: `assets.go`
- Modify: `main.go` (reescrita do wiring; ver Step 10)

**Interfaces:**
- Consumes: `app.New`, `*app.Host` (`SetError`, `SetHotkeyWarning`, `Configure`, `SetSession`, `ShowWindow`), `config.Load/DefaultPath/Default/SaveModel/SaveProfile`, `improver.New`, `llm.NewOpenAIClient`, `llm.WithTemperature`.
- Produces (usados pelas Tasks 7 e 8):
  - `func LoadConfig() (*config.Config, string, error)`
  - `func NewRunner(cfg *config.Config) Runner`
  - `func LoadStartupConfig(load func() (*config.Config, string, error)) (cfg *config.Config, path string, errMsg string)`
  - `type Shortcuts interface { Register(accelerator string, callback func()) error; Unregister(accelerator string) error; IsRegistered(accelerator string) bool }`
  - `type ReloaderOptions struct { Host *Host; Shortcuts Shortcuts; Load func() (*config.Config, string, error); NewRunner func(*config.Config) Runner; DetectSession func() platform.Session; OnHotkey func(); Hotkey string; ConfigPath string }`
  - `func NewReloader(o ReloaderOptions) *Reloader`; métodos `RegisterHotkey()`, `HotkeyFailed() bool`, `Reload()`, `ConfigPath() string`, `CurrentHotkey() string`, `SaveModel(model string) error`, `SaveProfile(p config.Profile) error`
  - `func HotkeyWarning(hotkey string) string`
  - `const TriggerArg = "--trigger"`; `type StartupAction int` com `StartupNone`, `StartupShow`, `StartupTrigger`; `type LaunchQueue struct{...}` com `OnSecondInstance(args []string)`, `SetHandler(fn func(capture bool))`, `Drain(osArgs []string, mustShow bool) StartupAction`

- [ ] **Step 1: Testes de `launch.go` (falham)**

```go
package app

import "testing"

func TestLaunchQueueCallsHandlerWhenSet(t *testing.T) {
	var q LaunchQueue
	var got []bool
	q.SetHandler(func(capture bool) { got = append(got, capture) })
	q.OnSecondInstance([]string{"kraa"})
	q.OnSecondInstance([]string{"kraa", TriggerArg})
	if len(got) != 2 || got[0] || !got[1] {
		t.Fatalf("got = %v", got)
	}
	if a := q.Drain(nil, false); a != StartupNone {
		t.Fatalf("Drain = %v, want StartupNone (nada pendente)", a)
	}
}

func TestLaunchQueueQueuesUntilHandlerAndDrainsOnce(t *testing.T) {
	var q LaunchQueue
	q.OnSecondInstance([]string{"kraa", TriggerArg})
	q.OnSecondInstance([]string{"kraa"}) // o primeiro pendente vence (CAS)
	if a := q.Drain(nil, false); a != StartupTrigger {
		t.Fatalf("Drain = %v, want StartupTrigger", a)
	}
	if a := q.Drain(nil, false); a != StartupNone {
		t.Fatalf("segundo Drain = %v, want StartupNone", a)
	}
}

func TestLaunchQueueDrainPriorities(t *testing.T) {
	cases := []struct {
		name     string
		pending  []string
		osArgs   []string
		mustShow bool
		want     StartupAction
	}{
		{"nada", nil, nil, false, StartupNone},
		{"show pendente", []string{"kraa"}, nil, false, StartupShow},
		{"--trigger no próprio boot", nil, []string{TriggerArg}, false, StartupTrigger},
		{"mustShow (erro de config ou atalho)", nil, nil, true, StartupShow},
		{"trigger vence mustShow", nil, []string{TriggerArg}, true, StartupTrigger},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			var q LaunchQueue
			if c.pending != nil {
				q.OnSecondInstance(c.pending)
			}
			if got := q.Drain(c.osArgs, c.mustShow); got != c.want {
				t.Fatalf("Drain = %v, want %v", got, c.want)
			}
		})
	}
}
```

Run: `go test ./internal/app/ -run LaunchQueue` → FAIL (`undefined: LaunchQueue`).

- [ ] **Step 2: Implementar `internal/app/launch.go`**

```go
package app

import (
	"slices"
	"sync/atomic"
)

// TriggerArg makes a second launch run the hotkey flow (manual fallback for
// Wayland/GNOME, where a custom system shortcut runs `kraa --trigger`).
const TriggerArg = "--trigger"

// StartupAction is what to do once the app has started.
type StartupAction int32

const (
	StartupNone StartupAction = iota
	StartupShow
	StartupTrigger
)

// LaunchQueue routes second-instance launches to the handler, queueing the
// first one that arrives before SetHandler so it is replayed by Drain on
// ApplicationStarted. Safe for concurrent use (the SingleInstance callback
// runs on another goroutine).
type LaunchQueue struct {
	handler atomic.Pointer[func(capture bool)]
	pending atomic.Int32
}

func (q *LaunchQueue) SetHandler(fn func(capture bool)) { q.handler.Store(&fn) }

func (q *LaunchQueue) OnSecondInstance(args []string) {
	capture := slices.Contains(args, TriggerArg)
	if fn := q.handler.Load(); fn != nil {
		(*fn)(capture)
		return
	}
	want := StartupShow
	if capture {
		want = StartupTrigger
	}
	q.pending.CompareAndSwap(int32(StartupNone), int32(want))
}

// Drain consumes the queued launch. osArgs are this process's own
// arguments (os.Args[1:]); mustShow forces the window when there is a
// config or hotkey problem the user would otherwise never see.
func (q *LaunchQueue) Drain(osArgs []string, mustShow bool) StartupAction {
	pending := StartupAction(q.pending.Swap(int32(StartupNone)))
	switch {
	case pending == StartupTrigger || slices.Contains(osArgs, TriggerArg):
		return StartupTrigger
	case pending == StartupShow || mustShow:
		return StartupShow
	}
	return StartupNone
}
```

Run: `go test -race ./internal/app/ -run LaunchQueue` → PASS.

- [ ] **Step 3: Testes de `bootstrap.go` (falham)**

```go
package app

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gustavofreitas/kraa/internal/config"
)

// isolateConfigDir points os.UserConfigDir at a temp dir on every OS.
func isolateConfigDir(t *testing.T) string {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(home, ".config"))
	t.Setenv("APPDATA", filepath.Join(home, "AppData", "Roaming"))
	return home
}

func TestLoadConfigCreatesDefaultFileAtDefaultPath(t *testing.T) {
	isolateConfigDir(t)
	cfg, path, err := LoadConfig()
	if err != nil {
		t.Fatal(err)
	}
	want, _ := config.DefaultPath()
	if path != want {
		t.Fatalf("path = %q, want %q", path, want)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("config.yaml não criado: %v", err)
	}
	if cfg.Hotkey == "" {
		t.Fatal("config sem hotkey")
	}
}

func TestLoadStartupConfigReturnsLoadedConfig(t *testing.T) {
	want := config.Default()
	cfg, path, msg := LoadStartupConfig(func() (*config.Config, string, error) { return want, "/x/config.yaml", nil })
	if cfg != want || path != "/x/config.yaml" || msg != "" {
		t.Fatalf("cfg=%p path=%q msg=%q", cfg, path, msg)
	}
}

func TestLoadStartupConfigFallsBackOnInvalidYAML(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	os.WriteFile(path, []byte("hotkey: [\n"), 0o600)
	t.Setenv(config.EnvAPIKey, "sk-env")

	cfg, gotPath, msg := LoadStartupConfig(func() (*config.Config, string, error) {
		c, err := config.Load(path)
		return c, path, err
	})
	if cfg == nil || cfg.Hotkey != config.Default().Hotkey {
		t.Fatalf("não caiu nos defaults: %+v", cfg)
	}
	if cfg.Provider.APIKey != "sk-env" {
		t.Fatalf("ApplyEnv não aplicado: api_key=%q", cfg.Provider.APIKey)
	}
	if gotPath != path {
		t.Fatalf("path = %q, want %q (mantido para o menu Editar configuração)", gotPath, path)
	}
	if !strings.HasPrefix(msg, "Erro ao carregar a configuração: ") || !strings.HasSuffix(msg, ". Usando a configuração padrão.") {
		t.Fatalf("msg = %q", msg)
	}
}

func TestLoadStartupConfigFallsBackWhenPathUnknown(t *testing.T) {
	cfg, path, msg := LoadStartupConfig(func() (*config.Config, string, error) { return nil, "", errors.New("sem HOME") })
	if cfg == nil || path != "" || !strings.Contains(msg, "sem HOME") {
		t.Fatalf("cfg=%v path=%q msg=%q", cfg, path, msg)
	}
}

func TestNewRunnerReturnsRunner(t *testing.T) {
	if NewRunner(config.Default()) == nil {
		t.Fatal("NewRunner retornou nil")
	}
}
```

Run: `go test ./internal/app/ -run 'LoadConfig|LoadStartup|NewRunner'` → FAIL.

- [ ] **Step 4: Implementar `internal/app/bootstrap.go`**

```go
package app

import (
	"fmt"
	"log"
	"time"

	"github.com/gustavofreitas/kraa/internal/config"
	"github.com/gustavofreitas/kraa/internal/improver"
	"github.com/gustavofreitas/kraa/internal/llm"
)

// LoadConfig loads the user config from the default path. The path is
// returned even when Load fails, so "Editar configuração" can open it.
func LoadConfig() (*config.Config, string, error) {
	path, err := config.DefaultPath()
	if err != nil {
		return nil, "", err
	}
	cfg, err := config.Load(path)
	return cfg, path, err
}

// NewRunner builds the LLM client + improver for cfg.
func NewRunner(cfg *config.Config) Runner {
	p := cfg.Provider
	var opts []llm.Option
	if p.Temperature != nil {
		opts = append(opts, llm.WithTemperature(*p.Temperature))
	}
	client := llm.NewOpenAIClient(p.BaseURL, p.APIKey, p.Model, time.Duration(p.TimeoutSeconds)*time.Second, opts...)
	return improver.New(cfg, client)
}

// LoadStartupConfig runs load and, on failure, falls back to the defaults
// (plus env overrides) with a PT-BR message for Host.SetError.
func LoadStartupConfig(load func() (*config.Config, string, error)) (*config.Config, string, string) {
	cfg, path, err := load()
	if err == nil {
		return cfg, path, ""
	}
	log.Printf("config: %v", err)
	cfg = config.Default()
	cfg.ApplyEnv()
	return cfg, path, fmt.Sprintf("Erro ao carregar a configuração: %v. Usando a configuração padrão.", err)
}
```

Run: `go test -race ./internal/app/ -run 'LoadConfig|LoadStartup|NewRunner'` → PASS.

- [ ] **Step 5: Testes de `reloader.go` (falham)**

Reusa `newHarness`, `fakeRunner`, `canSimulate` e `recorder` de `service_test.go` (mesmo pacote; não renomear).

```go
package app

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/gustavofreitas/kraa/internal/config"
	"github.com/gustavofreitas/kraa/internal/platform"
)

type fakeShortcuts struct {
	mu         sync.Mutex
	registered map[string]bool
	reject     map[string]bool
	calls      []string
}

func newFakeShortcuts() *fakeShortcuts {
	return &fakeShortcuts{registered: map[string]bool{}, reject: map[string]bool{}}
}

func (f *fakeShortcuts) Register(a string, _ func()) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, "register:"+a)
	if f.reject[a] {
		return errors.New("rejeitado pelo SO")
	}
	f.registered[a] = true
	return nil
}

func (f *fakeShortcuts) Unregister(a string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, "unregister:"+a)
	delete(f.registered, a)
	return nil
}

func (f *fakeShortcuts) IsRegistered(a string) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.registered[a]
}

// writeConfig writes the default template with hotkey replaced and returns a
// Load func reading it.
func writeConfig(t *testing.T, hotkey string) (string, func() (*config.Config, string, error)) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "config.yaml")
	if _, err := config.Load(path); err != nil { // cria o template padrão
		t.Fatal(err)
	}
	setHotkey(t, path, hotkey)
	return path, func() (*config.Config, string, error) {
		cfg, err := config.Load(path)
		return cfg, path, err
	}
}

func setHotkey(t *testing.T, path, hotkey string) {
	t.Helper()
	raw, _ := os.ReadFile(path)
	out := strings.Replace(string(raw), `hotkey: "CmdOrCtrl+Shift+Y"`, `hotkey: "`+hotkey+`"`, 1)
	if hotkey != "CmdOrCtrl+Shift+Y" && out == string(raw) {
		t.Fatal("template sem a linha de hotkey esperada")
	}
	os.WriteFile(path, []byte(out), 0o600)
}

func newTestReloader(t *testing.T, hotkey string) (*Reloader, *fakeShortcuts, *harness, string) {
	t.Helper()
	h := newHarness(t, fakeRunner{}, canSimulate)
	sc := newFakeShortcuts()
	path, load := writeConfig(t, hotkey)
	r := NewReloader(ReloaderOptions{
		Host:          h.host,
		Shortcuts:     sc,
		Load:          load,
		NewRunner:     func(*config.Config) Runner { return fakeRunner{} },
		DetectSession: func() platform.Session { return canSimulate },
		OnHotkey:      func() {},
		Hotkey:        hotkey,
		ConfigPath:    path,
	})
	return r, sc, h, path
}

func TestRegisterHotkeySuccessLeavesNoWarning(t *testing.T) {
	r, sc, h, _ := newTestReloader(t, "CmdOrCtrl+Shift+Y")
	r.RegisterHotkey()
	if !sc.IsRegistered("CmdOrCtrl+Shift+Y") || h.svc.GetState().Warning != "" {
		t.Fatalf("registered=%v warning=%q", sc.registered, h.svc.GetState().Warning)
	}
}

func TestRegisterHotkeyFailureSetsWarning(t *testing.T) {
	r, sc, h, _ := newTestReloader(t, "CmdOrCtrl+Shift+Y")
	sc.reject["CmdOrCtrl+Shift+Y"] = true
	r.RegisterHotkey()
	if w := h.svc.GetState().Warning; !strings.Contains(w, HotkeyWarning("CmdOrCtrl+Shift+Y")) {
		t.Fatalf("warning = %q", w)
	}
}

func TestHotkeyFailedReportsOSRejection(t *testing.T) {
	r, _, h, _ := newTestReloader(t, "CmdOrCtrl+Shift+Y")
	// Nunca registrado: equivale à rejeição do SO no flushPending.
	if !r.HotkeyFailed() {
		t.Fatal("HotkeyFailed = false")
	}
	if !strings.Contains(h.svc.GetState().Warning, "Não foi possível registrar o atalho CmdOrCtrl+Shift+Y") {
		t.Fatalf("warning = %q", h.svc.GetState().Warning)
	}
}

func TestReloadSameHotkeyClearsWarningWithoutReregistering(t *testing.T) {
	r, sc, h, _ := newTestReloader(t, "CmdOrCtrl+Shift+Y")
	r.RegisterHotkey()
	h.host.SetHotkeyWarning("velho")
	sc.calls = nil
	r.Reload()
	if len(sc.calls) != 0 || h.svc.GetState().Warning != "" {
		t.Fatalf("calls=%v warning=%q", sc.calls, h.svc.GetState().Warning)
	}
}

func TestReloadNewHotkeySwapsRegistration(t *testing.T) {
	r, sc, h, path := newTestReloader(t, "CmdOrCtrl+Shift+Y")
	r.RegisterHotkey()
	setHotkey(t, path, "CmdOrCtrl+Shift+K")
	r.Reload()
	if sc.IsRegistered("CmdOrCtrl+Shift+Y") || !sc.IsRegistered("CmdOrCtrl+Shift+K") {
		t.Fatalf("registered = %v", sc.registered)
	}
	if r.CurrentHotkey() != "CmdOrCtrl+Shift+K" || h.svc.GetState().Warning != "" {
		t.Fatalf("current=%q warning=%q", r.CurrentHotkey(), h.svc.GetState().Warning)
	}
}

func TestReloadNewHotkeyRejectedKeepsPrevious(t *testing.T) {
	r, sc, h, path := newTestReloader(t, "CmdOrCtrl+Shift+Y")
	r.RegisterHotkey()
	sc.reject["CmdOrCtrl+Shift+K"] = true
	setHotkey(t, path, "CmdOrCtrl+Shift+K")
	r.Reload()
	want := "Não foi possível registrar o atalho CmdOrCtrl+Shift+K. Mantido CmdOrCtrl+Shift+Y."
	if !sc.IsRegistered("CmdOrCtrl+Shift+Y") || r.CurrentHotkey() != "CmdOrCtrl+Shift+Y" || !strings.Contains(h.svc.GetState().Warning, want) {
		t.Fatalf("registered=%v current=%q warning=%q", sc.registered, r.CurrentHotkey(), h.svc.GetState().Warning)
	}
}

func TestReloadBothHotkeysRejected(t *testing.T) {
	r, sc, h, path := newTestReloader(t, "CmdOrCtrl+Shift+Y")
	r.RegisterHotkey()
	sc.reject["CmdOrCtrl+Shift+K"] = true
	sc.reject["CmdOrCtrl+Shift+Y"] = true
	setHotkey(t, path, "CmdOrCtrl+Shift+K")
	r.Reload()
	want := `Não foi possível registrar o atalho CmdOrCtrl+Shift+K. Nenhum atalho ativo; use "Abrir" na bandeja.`
	if !strings.Contains(h.svc.GetState().Warning, want) {
		t.Fatalf("warning = %q", h.svc.GetState().Warning)
	}
}

func TestReloadLoadErrorKeepsConfigAndShowsWindow(t *testing.T) {
	r, _, h, path := newTestReloader(t, "CmdOrCtrl+Shift+Y")
	before := h.svc.GetState().Model
	os.WriteFile(path, []byte("hotkey: [\n"), 0o600)
	r.Reload()
	st := h.svc.GetState()
	if !strings.HasPrefix(st.Error, "Erro ao recarregar a configuração: ") || !strings.HasSuffix(st.Error, "A configuração anterior foi mantida.") {
		t.Fatalf("error = %q", st.Error)
	}
	if st.Model != before {
		t.Fatalf("model trocou: %q -> %q", before, st.Model)
	}
	if !contains(h.rec.snapshot(), "show") {
		t.Fatalf("janela não exibida: %v", h.rec.snapshot())
	}
}

func TestSaveModelWritesFileAndReloads(t *testing.T) {
	r, _, h, path := newTestReloader(t, "CmdOrCtrl+Shift+Y")
	if err := r.SaveModel("outro-modelo"); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(path)
	if !strings.Contains(string(raw), `model: "outro-modelo"`) || h.svc.GetState().Model != "outro-modelo" {
		t.Fatalf("arquivo/estado não atualizados: model=%q\n%s", h.svc.GetState().Model, raw)
	}
}

func TestSaveProfileWritesFileAndReloads(t *testing.T) {
	r, _, h, path := newTestReloader(t, "CmdOrCtrl+Shift+Y")
	if err := r.SaveProfile(config.Profile{Enabled: true, Text: "Sou tester"}); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(path)
	if !strings.Contains(string(raw), "Sou tester") {
		t.Fatalf("perfil não gravado:\n%s", raw)
	}
	if p := h.svc.GetProfile(); !p.Enabled || p.Text != "Sou tester" {
		t.Fatalf("GetProfile = %+v", p)
	}
}

func TestSaversRejectUnknownPath(t *testing.T) {
	h := newHarness(t, fakeRunner{}, canSimulate)
	r := NewReloader(ReloaderOptions{Host: h.host, Shortcuts: newFakeShortcuts()})
	for name, err := range map[string]error{
		"model":   r.SaveModel("x"),
		"profile": r.SaveProfile(config.Profile{}),
	} {
		if err == nil || err.Error() != "o caminho do config.yaml é desconhecido" {
			t.Errorf("%s: err = %v", name, err)
		}
	}
}

func TestReloadsAreSerialized(t *testing.T) {
	r, _, _, _ := newTestReloader(t, "CmdOrCtrl+Shift+Y")
	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() { defer wg.Done(); r.Reload() }()
	}
	wg.Wait() // com -race: sem data race entre reloads concorrentes
}

func contains(xs []string, s string) bool {
	for _, x := range xs {
		if x == s {
			return true
		}
	}
	return false
}
```

Observação: se `fakeRunner{}` exigir campos, use o mesmo literal que `service_test.go` usa em `TestShowWindowOnlyShows`. Se `GetState().Warning` não incluir o aviso de atalho, use o campo que `TestHostErrorAndHotkeyWarningAreReflectedInState` (`service_test.go:491`) usa — ele é a referência de onde o aviso aparece. Se já existir um helper `contains` no pacote, remova o daqui.

Run: `go test ./internal/app/ -run 'Hotkey|Reload|Save'` → FAIL (`undefined: NewReloader`).

- [ ] **Step 6: Implementar `internal/app/reloader.go`**

```go
package app

import (
	"errors"
	"fmt"
	"log"
	"sync"

	"github.com/gustavofreitas/kraa/internal/config"
	"github.com/gustavofreitas/kraa/internal/platform"
)

// Shortcuts is the global hotkey registry; Wails'
// *application.GlobalShortcutManager satisfies it.
type Shortcuts interface {
	Register(accelerator string, callback func()) error
	Unregister(accelerator string) error
	IsRegistered(accelerator string) bool
}

type ReloaderOptions struct {
	Host          *Host
	Shortcuts     Shortcuts
	Load          func() (*config.Config, string, error)
	NewRunner     func(*config.Config) Runner
	DetectSession func() platform.Session
	OnHotkey      func()
	Hotkey        string // hotkey of the config loaded at startup
	ConfigPath    string // "" when the startup load could not resolve it
}

// Reloader re-reads config.yaml and applies it: new runner, session, and
// hotkey swap with rollback. It also backs the model/profile savers.
type Reloader struct {
	o        ReloaderOptions
	reloadMu sync.Mutex // serializes whole reloads so configs apply in click order
	mu       sync.Mutex // guards hotkey and path (tray callbacks run on goroutines)
	hotkey   string
	path     string
}

func NewReloader(o ReloaderOptions) *Reloader {
	return &Reloader{o: o, hotkey: o.Hotkey, path: o.ConfigPath}
}

// HotkeyWarning is the PT-BR warning for a hotkey that could not be registered.
func HotkeyWarning(hotkey string) string {
	return fmt.Sprintf("Não foi possível registrar o atalho %s; ele pode estar em uso por outro app. Altere 'hotkey' na configuração ou use \"Abrir\" na bandeja.", hotkey)
}

// RegisterHotkey registers the startup hotkey. Before app.Run this only
// fails on a parse error; an OS rejection is caught by HotkeyFailed.
func (r *Reloader) RegisterHotkey() {
	r.mu.Lock()
	defer r.mu.Unlock()
	if err := r.o.Shortcuts.Register(r.hotkey, r.o.OnHotkey); err != nil {
		log.Printf("atalho: %v", err)
		r.o.Host.SetHotkeyWarning(HotkeyWarning(r.hotkey))
	}
}

// HotkeyFailed reports (and warns) when the current hotkey is not
// registered — covers both a parse error and an OS rejection.
func (r *Reloader) HotkeyFailed() bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.o.Shortcuts.IsRegistered(r.hotkey) {
		return false
	}
	log.Printf("atalho: %s não registrado pelo SO", r.hotkey)
	r.o.Host.SetHotkeyWarning(HotkeyWarning(r.hotkey))
	return true
}

func (r *Reloader) ConfigPath() string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.path
}

func (r *Reloader) CurrentHotkey() string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.hotkey
}

func (r *Reloader) Reload() {
	r.reloadMu.Lock()
	defer r.reloadMu.Unlock()
	host := r.o.Host

	newCfg, path, err := r.o.Load()
	if err != nil {
		log.Printf("config: %v", err)
		host.SetError(fmt.Sprintf("Erro ao recarregar a configuração: %v. A configuração anterior foi mantida.", err))
		host.ShowWindow()
		return
	}
	host.Configure(newCfg, r.o.NewRunner(newCfg))
	host.SetSession(r.o.DetectSession())

	r.mu.Lock()
	defer r.mu.Unlock()
	r.path = path
	sc := r.o.Shortcuts
	if newCfg.Hotkey == r.hotkey && sc.IsRegistered(r.hotkey) {
		host.SetHotkeyWarning("")
		return
	}
	_ = sc.Unregister(r.hotkey)
	if err := sc.Register(newCfg.Hotkey, r.o.OnHotkey); err != nil {
		log.Printf("atalho: %v", err)
		if err := sc.Register(r.hotkey, r.o.OnHotkey); err != nil {
			log.Printf("atalho: %v", err)
			host.SetHotkeyWarning(fmt.Sprintf("Não foi possível registrar o atalho %s. Nenhum atalho ativo; use \"Abrir\" na bandeja.", newCfg.Hotkey))
			return
		}
		host.SetHotkeyWarning(fmt.Sprintf("Não foi possível registrar o atalho %s. Mantido %s.", newCfg.Hotkey, r.hotkey))
		return
	}
	r.hotkey = newCfg.Hotkey
	host.SetHotkeyWarning("")
}

// SaveModel persists provider.model, then reloads (Host.SetModelSaver).
func (r *Reloader) SaveModel(model string) error {
	return r.saveThenReload(func(path string) error { return config.SaveModel(path, model) })
}

// SaveProfile persists the profile block, then reloads (Host.SetProfileSaver).
func (r *Reloader) SaveProfile(p config.Profile) error {
	return r.saveThenReload(func(path string) error { return config.SaveProfile(path, p) })
}

func (r *Reloader) saveThenReload(save func(path string) error) error {
	path := r.ConfigPath()
	if path == "" {
		return errors.New("o caminho do config.yaml é desconhecido")
	}
	if err := save(path); err != nil {
		return err
	}
	r.Reload()
	return nil
}
```

Run: `go test -race ./internal/app/` → PASS (todos, inclusive os antigos).

- [ ] **Step 7: Criar `assets.go`**

```go
package main

import "embed"

// Wails uses Go's `embed` package to embed the frontend files into the binary.
// Any files in the frontend/dist folder will be embedded into the binary and
// made available to the frontend. Shared by main.go (desktop) and
// main_server.go (-tags server, E2E only).
//
//go:embed all:frontend/dist
var assets embed.FS
```

- [ ] **Step 8: Reescrever o `main.go` usando os novos tipos**

Substituir o arquivo inteiro por (sem a build tag ainda — ela entra na Task 8):

```go
package main

import (
	"log"
	"os"
	"runtime"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"github.com/wailsapp/wails/v3/pkg/icons"

	"github.com/gustavofreitas/kraa/internal/app"
	"github.com/gustavofreitas/kraa/internal/autostart"
	"github.com/gustavofreitas/kraa/internal/config"
	"github.com/gustavofreitas/kraa/internal/platform"
)

// menuCheckbox adapts *application.MenuItem to autostart.Checkbox: it only
// discards MenuItem.SetChecked's chained return value, which
// internal/autostart's interface (kept Wails-free) doesn't need.
type menuCheckbox struct{ item *application.MenuItem }

func (c menuCheckbox) SetChecked(checked bool) { c.item.SetChecked(checked) }

// main is the application entry point. It creates the Wails app, a hidden
// frameless window, the ImproveService bound to the frontend, the global
// hotkey and a system tray. The window is never destroyed when
// closed/hidden: the app keeps running in the tray. The testable logic
// (reload/hotkey rollback, savers, second-instance queue, config fallback)
// lives in internal/app; this file is wiring only.
func main() {
	// A launch arriving before the handler is set is queued and replayed
	// on ApplicationStarted.
	var launches app.LaunchQueue

	wailsApp := application.New(application.Options{
		Name:        "kraa",
		Description: "Melhora o texto selecionado via LLM compatível com OpenAI",
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ActivationPolicy: application.ActivationPolicyAccessory,
			// Keep the app running in the tray after the window closes/hides.
			ApplicationShouldTerminateAfterLastWindowClosed: false,
		},
		Windows: application.WindowsOptions{
			DisableQuitOnLastWindowClosed: true,
		},
		Linux: application.LinuxOptions{
			DisableQuitOnLastWindowClosed: true,
		},
		SingleInstance: &application.SingleInstanceOptions{
			UniqueID: "dev.matrixia.kraa",
			OnSecondInstanceLaunch: func(data application.SecondInstanceData) {
				launches.OnSecondInstance(data.Args)
			},
		},
	})

	window := wailsApp.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:       "Kraa",
		Width:       560,
		Height:      580,
		Frameless:   true,
		AlwaysOnTop: true,
		Hidden:      true,
		// No HideOnEscape: Esc is bound below to svc.Close so the stream is
		// cancelled and focus is handed back to the source app.
		Windows: application.WindowsWindow{
			HiddenOnTaskbar: true,
		},
		BackgroundColour: application.NewRGB(22, 23, 27), // --background (dark)
		URL:              "/",
	})
	// "Perfil do usuário": a regular (framed) window opened from the tray.
	// Same frontend bundle; main.tsx renders ProfileWindow for ?view=profile.
	profileWindow := wailsApp.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:             "profile",
		Title:            "Perfil do usuário",
		Width:            520,
		Height:           460,
		Hidden:           true,
		BackgroundColour: application.NewRGB(22, 23, 27), // --background (dark)
		URL:              "/?view=profile",
	})
	// macOS: ask once for the Accessibility permission (shows the system
	// prompt); without it canReplace stays false and a warning is shown.
	if runtime.GOOS == "darwin" {
		platform.AccessibilityTrusted(true)
	}

	cfg, cfgPath, cfgErrMsg := app.LoadStartupConfig(app.LoadConfig)

	svc, host := app.New(app.Options{
		Config:    cfg,
		Runner:    app.NewRunner(cfg),
		Emitter:   app.WailsEmitter{App: wailsApp},
		Clipboard: app.WailsClipboard{App: wailsApp},
		Keys:      platform.NewKeySender(),
		Window:    app.WailsWindow{App: wailsApp, Window: window},
		Session:   platform.DetectSession(),

		ProfileWindow: app.WailsWindow{App: wailsApp, Window: profileWindow},
	})
	wailsApp.RegisterService(application.NewService(svc))

	// Closing (e.g. Cmd+W / Alt+F4) and Esc go through Close: cancel the
	// stream, hide instead of destroying, and return focus (macOS).
	window.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
		e.Cancel()
		svc.Close()
	})
	window.RegisterKeyBinding("escape", func(application.Window) {
		svc.Close()
	})

	// Closing the profile window only hides it (the app lives in the tray).
	profileWindow.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
		e.Cancel()
		svc.CloseProfile()
	})
	profileWindow.RegisterKeyBinding("escape", func(application.Window) {
		svc.CloseProfile()
	})

	if cfgErrMsg != "" {
		host.SetError(cfgErrMsg)
	}

	onHotkey := func() {
		// Re-check each time so a permission granted after launch is
		// picked up without restarting.
		host.SetSession(platform.DetectSession())
		host.Trigger()
	}
	launches.SetHandler(func(capture bool) {
		if capture {
			onHotkey()
		} else {
			host.ShowWindow()
		}
	})

	reloader := app.NewReloader(app.ReloaderOptions{
		Host:          host,
		Shortcuts:     wailsApp.GlobalShortcut,
		Load:          app.LoadConfig,
		NewRunner:     app.NewRunner,
		DetectSession: platform.DetectSession,
		OnHotkey:      onHotkey,
		Hotkey:        cfg.Hotkey,
		ConfigPath:    cfgPath,
	})
	reloader.RegisterHotkey()
	// Model picker / profile window: persist in config.yaml, then reload.
	host.SetModelSaver(reloader.SaveModel)
	host.SetProfileSaver(reloader.SaveProfile)

	tray := wailsApp.SystemTray.New()
	tray.SetTooltip("Kraa")

	if runtime.GOOS == "darwin" {
		tray.SetTemplateIcon(icons.SystrayMacTemplate)
	} else {
		tray.SetDarkModeIcon(icons.SystrayDark)
		tray.SetIcon(icons.SystrayLight)
	}

	trayMenu := wailsApp.Menu.New()

	trayMenu.Add("Abrir").OnClick(func(ctx *application.Context) {
		host.ShowWindow()
	})
	trayMenu.Add("Perfil do usuário…").OnClick(func(ctx *application.Context) {
		host.ShowProfile()
	})
	trayMenu.Add("Editar configuração").OnClick(func(ctx *application.Context) {
		path := reloader.ConfigPath()
		if path == "" {
			p, err := config.DefaultPath()
			if err != nil {
				log.Printf("config: %v", err)
				return
			}
			path = p
		}
		if err := app.OpenFile(path); err != nil {
			log.Printf("config: %v", err)
		}
	})
	trayMenu.Add("Recarregar configuração").OnClick(func(ctx *application.Context) {
		reloader.Reload()
	})

	// "Iniciar com o sistema": reuses internal/autostart, which produces the
	// exact same LaunchAgent/registry key/.desktop artifacts as the npm CLI
	// (`kraa autostart on|off`). If New fails (e.g. `wails3 dev`
	// running from a temp path outside a .app bundle on macOS), the item is
	// hidden since there's nothing autostart-able to toggle. Clicks go
	// through a Toggler, which serializes them: Wails runs every click's
	// OnClick in its own goroutine, so two quick clicks could otherwise run
	// Enable/Disable concurrently.
	autostartItem := trayMenu.AddCheckbox("Iniciar com o sistema", false)
	if autostartMgr, err := autostart.New(); err != nil {
		log.Printf("autostart: %v", err)
		autostartItem.SetHidden(true)
	} else {
		enabled, err := autostartMgr.Enabled()
		if err != nil {
			log.Printf("autostart: %v", err)
		}
		autostartItem.SetChecked(enabled)
		toggler := autostart.NewToggler(autostartMgr)
		autostartItem.OnClick(func(ctx *application.Context) {
			// want and gen are this click's own intent, captured before
			// Toggle blocks on the lock; see Toggler's doc comment for why
			// Toggle must not re-derive them from the checkbox itself.
			want := ctx.IsChecked()
			gen := toggler.NextGeneration()
			toggler.Toggle(want, gen, menuCheckbox{autostartItem}, func(msg string) {
				if msg != "" {
					log.Printf("autostart: %s", msg)
				}
				host.SetWarning(msg)
			})
		})
	}

	trayMenu.AddSeparator()

	trayMenu.Add("Sair").OnClick(func(ctx *application.Context) {
		wailsApp.Quit()
	})

	tray.SetMenu(trayMenu)

	wailsApp.Event.OnApplicationEvent(events.Common.ApplicationStarted, func(*application.ApplicationEvent) {
		hotkeyFailed := reloader.HotkeyFailed()
		// Without a working hotkey (or with a config error) the user would
		// never see the warning, so surface the window with it.
		switch launches.Drain(os.Args[1:], cfgErrMsg != "" || hotkeyFailed) {
		case app.StartupTrigger:
			// Launched (or re-launched early) via the --trigger shortcut.
			go onHotkey()
		case app.StartupShow:
			host.ShowWindow()
		}
	})

	// Run the application. This blocks until the application has been exited.
	if err := wailsApp.Run(); err != nil {
		log.Fatal(err)
	}
}
```

- [ ] **Step 9: Verificar compilação, vet e testes**

Run:
```bash
gofmt -l . && go vet ./... && go build -o /dev/null . && go test -race ./...
```
Expected: `gofmt -l` sem saída; vet/build/test ok. (No Linux: `-tags gtk3` em vet/build/test.)
Se `wailsApp.GlobalShortcut` não satisfizer `app.Shortcuts` (erro de compilação), conferir no modcache `pkg/application/global_shortcut_manager.go` (assinaturas: `Register(accelerator string, callback func()) error`, `Unregister(accelerator string) error`, `IsRegistered(accelerator string) bool`) e ajustar a interface — não criar adapter.

- [ ] **Step 10: Verificação manual rápida (macOS)**

Run: `wails3 dev` → apertar `⌘⇧Y` com texto selecionado noutro app; o modal abre com o texto. Bandeja → "Recarregar configuração" sem erro. Fechar.

- [ ] **Step 11: Commit**

```bash
git add assets.go main.go internal/app/bootstrap.go internal/app/bootstrap_test.go internal/app/reloader.go internal/app/reloader_test.go internal/app/launch.go internal/app/launch_test.go
git commit -m "refactor: extrai reload, savers e fila de instância do main.go para internal/app"
```

---

### Task 3: Lacunas e fragilidade dos testes do backend

**Files:**
- Modify: `internal/llm/client_test.go`, `internal/llm/models_test.go`
- Modify: `internal/config/config_test.go`, `internal/config/save_test.go`
- Modify: `internal/platform/keys_linux.go`; Create: `internal/platform/keys_linux_test.go`
- Modify: `internal/autostart/autostart.go`, `internal/autostart/autostart_test.go`
- Modify: `internal/app/service_test.go`, `internal/autostart/toggle_test.go` (remover `sleep`)

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: `platform.xdotoolKeyWith(run func(ctx context.Context, name string, args ...string) *exec.Cmd, combo string) error` (não exportado, só Linux); `autostart.newManager(goos, home, configDir, exe string) (*Manager, error)` (não exportado). Nenhuma outra task depende disso.

- [ ] **Step 1: `readSSEStream` e erros HTTP — testes novos em `internal/llm/client_test.go`**

Adicionar (reusa `writeSSE`):

```go
func TestStream_IgnoresCommentsNonDataInvalidJSONAndEmptyChoices(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeSSE(w, r, []string{
			`: keep-alive`,
			`event: ping`,
			`data: {não é json`,
			`data: {"choices":[]}`,
			`data: {"choices":[{"delta":{"content":""}}]}`,
			`data: {"choices":[{"delta":{"content":"ok"}}]}`,
			`data: [DONE]`,
		})
	}))
	defer server.Close()

	var got strings.Builder
	c := NewOpenAIClient(server.URL, "", "m", 5*time.Second)
	if err := c.Stream(context.Background(), []Message{{Role: "user", Content: "x"}}, func(s string) { got.WriteString(s) }); err != nil {
		t.Fatal(err)
	}
	if got.String() != "ok" {
		t.Fatalf("got %q", got.String())
	}
}

func TestStream_LineAboveLimitReturnsReadError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeSSE(w, r, []string{"data: " + strings.Repeat("a", maxSSELineBytes+1)})
	}))
	defer server.Close()

	c := NewOpenAIClient(server.URL, "", "m", 5*time.Second)
	err := c.Stream(context.Background(), []Message{{Role: "user", Content: "x"}}, func(string) {})
	if err == nil || !strings.Contains(err.Error(), "ler stream") {
		t.Fatalf("err = %v", err)
	}
}

func TestStream_InvalidBaseURLFailsBeforeRequest(t *testing.T) {
	c := NewOpenAIClient("://sem-esquema", "", "m", time.Second)
	if err := c.Stream(context.Background(), nil, func(string) {}); err == nil {
		t.Fatal("esperava erro de URL inválida")
	}
}

func TestAPIErrorFromResponse(t *testing.T) {
	cases := []struct {
		name   string
		status int
		body   string
		want   string
	}{
		{"corpo vazio usa StatusText", 502, "", "Bad Gateway"},
		{"status desconhecido usa o número", 599, "", "599"},
		{"corpo longo é cortado", 500, strings.Repeat("x", maxErrorBodySnippet+50), strings.Repeat("x", maxErrorBodySnippet)},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			resp := &http.Response{StatusCode: c.status, Body: io.NopCloser(strings.NewReader(c.body))}
			got := newAPIErrorFromResponse(resp)
			if got.Message != c.want || got.Status != c.status {
				t.Fatalf("got %+v", got)
			}
			if got.Error() == "" {
				t.Fatal("APIError.Error() vazio")
			}
		})
	}
}

func TestIsUnreachableErr_DNSError(t *testing.T) {
	if !isUnreachableErr(&net.DNSError{Err: "no such host", Name: "x.invalid"}) {
		t.Fatal("DNSError deveria ser unreachable")
	}
}
```

Adicionar imports `io` e `net` se faltarem. Run: `go test ./internal/llm/ -run 'IgnoresComments|AboveLimit|InvalidBaseURL|APIErrorFrom|DNSError'`. Os testes cobrem código que já existe, então **devem passar de primeira**; se algum falhar, é bug real — investigar com `superpowers:systematic-debugging` antes de mudar o teste.

- [ ] **Step 2: `config.Load` com YAML inválido e erro de leitura — `internal/config/config_test.go`**

```go
func TestLoad_InvalidYAMLReturnsPTBRError(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.yaml")
	os.WriteFile(path, []byte("hotkey: [\n"), 0o600)
	_, err := Load(path)
	if err == nil || !strings.Contains(err.Error(), "YAML inválido em "+path) {
		t.Fatalf("err = %v", err)
	}
}

func TestLoad_ReadErrorOtherThanNotExist(t *testing.T) {
	dir := t.TempDir() // um diretório no lugar do arquivo: ReadFile falha com EISDIR
	_, err := Load(dir)
	if err == nil || !strings.Contains(err.Error(), "não foi possível ler") {
		t.Fatalf("err = %v", err)
	}
}

func TestLoad_CannotCreateDefaultFile(t *testing.T) {
	parent := filepath.Join(t.TempDir(), "arquivo")
	os.WriteFile(parent, nil, 0o600) // "diretório" pai é um arquivo
	_, err := Load(filepath.Join(parent, "config.yaml"))
	if err == nil || !strings.Contains(err.Error(), "não foi possível criar") {
		t.Fatalf("err = %v", err)
	}
}
```

Em `internal/config/save_test.go`, cobrir `writeFileAtomic` falhando:

```go
func TestSaveModel_FailsWhenDirIsReadOnly(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("permissões POSIX")
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	if _, err := Load(path); err != nil {
		t.Fatal(err)
	}
	os.Chmod(dir, 0o500)
	t.Cleanup(func() { os.Chmod(dir, 0o700) })
	if err := SaveModel(path, "x"); err == nil {
		t.Fatal("esperava erro ao gravar em diretório somente leitura")
	}
}
```

(`runtime.GOOS` em teste com `t.Skip` é aceitável — não é código de produção.) Run: `go test ./internal/config/` → PASS (se falhar, é bug real).

- [ ] **Step 3: `keys_linux.go` com runner injetável (TDD)**

Criar `internal/platform/keys_linux_test.go`:

```go
//go:build linux

package platform

import (
	"context"
	"os/exec"
	"strings"
	"testing"
)

func TestXdotoolKeyPassesClearModifiers(t *testing.T) {
	var gotName string
	var gotArgs []string
	run := func(ctx context.Context, name string, args ...string) *exec.Cmd {
		gotName, gotArgs = name, args
		return exec.CommandContext(ctx, "true")
	}
	if err := xdotoolKeyWith(run, "ctrl+c"); err != nil {
		t.Fatal(err)
	}
	if gotName != "xdotool" || strings.Join(gotArgs, " ") != "key --clearmodifiers ctrl+c" {
		t.Fatalf("%s %v", gotName, gotArgs)
	}
}

func TestXdotoolKeyErrorIncludesStderr(t *testing.T) {
	run := func(ctx context.Context, _ string, _ ...string) *exec.Cmd {
		return exec.CommandContext(ctx, "sh", "-c", "echo 'Can not open display' >&2; exit 1")
	}
	err := xdotoolKeyWith(run, "ctrl+v")
	if err == nil || !strings.Contains(err.Error(), "xdotool key ctrl+v") || !strings.Contains(err.Error(), "Can not open display") {
		t.Fatalf("err = %v", err)
	}
}

func TestXdotoolKeyErrorWithoutStderr(t *testing.T) {
	run := func(ctx context.Context, _ string, _ ...string) *exec.Cmd {
		return exec.CommandContext(ctx, "false")
	}
	err := xdotoolKeyWith(run, "ctrl+v")
	if err == nil || strings.HasSuffix(err.Error(), ": ") {
		t.Fatalf("err = %v", err)
	}
}
```

Implementação em `keys_linux.go`: renomear o corpo de `xdotoolKey` para `xdotoolKeyWith(run func(ctx context.Context, name string, args ...string) *exec.Cmd, combo string) error` trocando `exec.CommandContext(ctx, "xdotool", ...)` por `run(ctx, "xdotool", "key", "--clearmodifiers", combo)`, e deixar `func xdotoolKey(combo string) error { return xdotoolKeyWith(exec.CommandContext, combo) }`.

Verificação no macOS (compila o arquivo Linux e o teste): `GOOS=linux CGO_ENABLED=0 go vet ./internal/platform/` (o pacote não usa cgo no Linux). Os testes rodam de verdade no job Ubuntu da CI.

- [ ] **Step 4: `autostart.New` puro (TDD)**

Ler `internal/autostart/autostart.go:34-68`. Extrair o corpo de `New` para `func newManager(goos, home, configDir, exe string) (*Manager, error)`, deixando `New()` só resolver `runtime.GOOS`, `os.UserHomeDir()`, `os.UserConfigDir()` (se usado) e `os.Executable()` e chamar `newManager`. Testes em `autostart_test.go` (tabela por `goos` com `home`/`exe` falsos), cobrindo: darwin com exe dentro de `.app` → ok; darwin fora de `.app` → `*bundleError` cuja `Error()` contém "não está dentro de um pacote .app"; linux → caminho `.desktop` sob `configDir/autostart`; windows → manager com `runReg`. Os valores esperados de cada caminho saem do código atual de `New` — copie-os do código, não invente.

```go
func TestNewManagerPerOS(t *testing.T) {
	cases := []struct {
		name, goos, exe string
		wantErr         string
	}{
		{"darwin dentro do .app", "darwin", "/Applications/Kraa.app/Contents/MacOS/kraa", ""},
		{"darwin fora do .app", "darwin", "/tmp/kraa", "não está dentro de um pacote .app"},
		{"linux", "linux", "/home/u/.local/share/kraa/kraa", ""},
		{"windows", "windows", `C:\Users\u\AppData\Local\kraa\kraa.exe`, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			m, err := newManager(c.goos, "/home/u", "/home/u/.config", c.exe)
			if c.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), c.wantErr) {
					t.Fatalf("err = %v", err)
				}
				return
			}
			if err != nil || m == nil {
				t.Fatalf("m=%v err=%v", m, err)
			}
		})
	}
}
```

Adicionar asserções do caminho de `m.autostartFile()` por SO copiando o formato que `New` produz hoje. Run: `go test ./internal/autostart/` → PASS.

- [ ] **Step 5: Tirar `time.Sleep` dos testes do `internal/app` com `testing/synctest`**

Em `service_test.go` linhas ~277, ~308, ~345, ~396 (asserções "nenhum evento chegou depois de X") e em `toggle_test.go` ~90/~104: envolver o corpo do teste em `synctest.Test(t, func(t *testing.T) { ... })` e trocar cada `time.Sleep(...)` usado "para esperar goroutines" por `synctest.Wait()`. Dentro de uma bolha synctest o relógio é virtual, então `waitFor` (polling de 2 ms com prazo de 2 s, `service_test.go:45-58`) continua funcionando.

Exemplo do padrão (aplicar a cada teste citado):

```go
func TestCancelStopsRequestWithoutFurtherEvents(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		// ... corpo atual até o Cancel ...
		h.svc.Cancel(id)
		synctest.Wait() // todas as goroutines do teste estão bloqueadas: nada mais será emitido
		// ... asserções atuais de "nenhum evento depois" ...
	})
}
```

Regras: (a) um teste que usa `httptest`/rede real **não** pode ir para synctest (I/O de rede não é "durably blocking") — nesses, trocar o sleep por um canal `done` fechado pelo fake; (b) não mudar o que o teste afirma. Run 5 vezes para pegar flakiness:

```bash
go test -race -count=5 ./internal/app/ ./internal/autostart/
```
Expected: PASS nas 5; tempo total do pacote `internal/app` menor que antes.

- [ ] **Step 6: Rodar tudo e medir**

```bash
go test -race ./... && go test -coverprofile=/tmp/kraa-cover.out ./internal/... >/dev/null && go tool cover -func=/tmp/kraa-cover.out | tail -1
```
Expected: PASS; `total:` ≥ 87.0%. Se ficar abaixo, **não** baixar a meta — reportar os números por pacote.

- [ ] **Step 7: Commit**

```bash
git add internal/llm internal/config internal/platform internal/autostart internal/app/service_test.go
git commit -m "test(backend): cobre SSE, YAML inválido, xdotool e autostart; troca sleeps por synctest"
```

---

### Task 4: Infra de testes do frontend (cobertura, typecheck, lint, mocks tipados)

**Files:**
- Modify: `frontend/package.json`, `frontend/package-lock.json`
- Create: `frontend/eslint.config.js`
- Modify: `frontend/vitest.config.ts`
- Modify: `frontend/src/test/improveServiceMock.ts`, `frontend/src/test/wailsRuntimeMock.ts`, `frontend/src/test/setup.ts`
- Modify: todos os `frontend/src/**/*.test.ts(x)` (remover os blocos `vi.mock` desses dois módulos e os `reset*()` manuais)

**Interfaces:**
- Produces (usado pela Task 5): scripts `npm run typecheck`, `npm run lint`, `npm run coverage`; mocks aplicados globalmente por alias (nenhum teste precisa de `vi.mock` para `@wailsio/runtime` ou para o barrel `@bindings/github.com/gustavofreitas/kraa/internal/app`); `emit(name, data)` e `ImproveService` importáveis de `src/test/*`; reset automático entre testes.

- [ ] **Step 1: Dependências e scripts**

```bash
cd frontend
npm i -D @vitest/coverage-v8@^5 eslint@^9 @eslint/js@^9 typescript-eslint eslint-plugin-react-hooks globals
```

Em `package.json` → `scripts`, adicionar:

```json
"typecheck": "tsc --noEmit",
"lint": "eslint .",
"coverage": "vitest run --coverage"
```

Antes de escrever o `eslint.config.js`, consultar via context7 a flat config atual de `typescript-eslint` e `eslint-plugin-react-hooks` na versão instalada (`npm ls eslint-plugin-react-hooks typescript-eslint`).

- [ ] **Step 2: `frontend/eslint.config.js`**

```js
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // shadcn/ui vendored components and generated bindings aren't hand-maintained.
  { ignores: ["dist", "coverage", "bindings", "src/components/ui"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
);
```

Run: `npm run lint`. Corrigir os erros reais no código. `@typescript-eslint/no-explicit-any` em testes pode virar `"off"` via um bloco `{ files: ["src/**/*.test.{ts,tsx}", "src/test/**"], rules: { "@typescript-eslint/no-explicit-any": "off" } }` — não desligar regras globalmente. O `eslint-disable react-hooks/exhaustive-deps` em `Footer.tsx:43` passa a ter efeito; mantê-lo só se o warning aparecer sem ele. Expected final: `npm run lint` com 0 erros (warnings aceitáveis só em `exhaustive-deps` já justificados em comentário).

- [ ] **Step 3: `npm run typecheck`**

Run: `npm run typecheck` → Expected: exit 0 (já passava via `tsc` do build). Se falhar por arquivos de teste, corrigir os tipos no teste.

- [ ] **Step 4: Mocks tipados — teste que falha**

Tipar o mock contra o binding gerado. Em `src/test/improveServiceMock.ts`, adicionar no topo:

```ts
import type * as RealService from "../../bindings/github.com/gustavofreitas/kraa/internal/app/improveservice";
```

e trocar `export const ImproveService = { ... };` por `export const ImproveService = { ... } satisfies Record<keyof typeof RealService, unknown>;`.

Para ver o gate funcionando, remover temporariamente `SetModel` do objeto e rodar `npm run typecheck` → Expected: FAIL com "Property 'SetModel' is missing". Recolocar.

- [ ] **Step 5: Reset completo e aplicado globalmente**

Reescrever `src/test/improveServiceMock.ts` mantendo os mesmos métodos, com defaults num só lugar:

```ts
import { vi } from "vitest";
import type * as RealService from "../../bindings/github.com/gustavofreitas/kraa/internal/app/improveservice";

// Stand-in for the generated ImproveService binding (aliased in
// vitest.config.ts). `satisfies` makes `npm run typecheck` fail when a Go
// method is added/renamed and the mock isn't. Every method returns a plain
// Promise; the app never calls `.cancel()` on the results.
const defaultState = () => ({
  text: "",
  actions: [],
  canReplace: true,
  warning: "",
  error: "",
  model: "",
});

export const ImproveService = {
  Cancel: vi.fn(),
  Close: vi.fn(),
  CloseProfile: vi.fn(),
  Copy: vi.fn(),
  GetState: vi.fn(),
  GetProfile: vi.fn(),
  ListModels: vi.fn(),
  Replace: vi.fn(),
  SaveProfile: vi.fn(),
  SetModel: vi.fn(),
  Start: vi.fn(),
} satisfies Record<keyof typeof RealService, unknown>;

function applyDefaults() {
  ImproveService.Cancel.mockResolvedValue(undefined);
  ImproveService.Close.mockResolvedValue(undefined);
  ImproveService.CloseProfile.mockResolvedValue(undefined);
  ImproveService.Copy.mockResolvedValue(undefined);
  ImproveService.GetState.mockResolvedValue(defaultState());
  ImproveService.GetProfile.mockResolvedValue({ enabled: false, text: "" });
  ImproveService.ListModels.mockResolvedValue([]);
  ImproveService.Replace.mockResolvedValue(undefined);
  ImproveService.SaveProfile.mockResolvedValue(undefined);
  ImproveService.SetModel.mockResolvedValue(undefined);
  ImproveService.Start.mockResolvedValue("req-1");
}
applyDefaults();

/** mockReset on every method (drops Once *and* persistent implementations), then defaults. */
export function resetImproveServiceMock() {
  for (const fn of Object.values(ImproveService)) fn.mockReset();
  applyDefaults();
}
```

Se o barrel `bindings/.../internal/app/index.ts` exportar outros valores de runtime usados pelo app (conferir com `grep -rn "from \"@bindings" frontend/src`), exportá-los também deste módulo. Hoje só `ImproveService` é valor; `ActionDTO`, `ProfileDTO` etc. são só tipos.

`src/test/setup.ts` — acrescentar ao final:

```ts
import { afterEach } from "vitest";
import { resetWailsMock } from "./wailsRuntimeMock";
import { resetImproveServiceMock } from "./improveServiceMock";

// Global reset so no test inherits listeners or mock implementations.
afterEach(() => {
  resetWailsMock();
  resetImproveServiceMock();
});
```

- [ ] **Step 6: Alias no `vitest.config.ts` + cobertura com thresholds**

```ts
import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const src = (p: string) => path.resolve(import.meta.dirname, "./src", p);

// Dedicated Vitest config (kept separate from vite.config.ts) so the
// @wailsio/runtime typed-events Vite plugin — which requires generated
// bindings to be present and wired for a real build — never runs during
// unit tests. The Wails runtime and the ImproveService binding are aliased
// to in-memory mocks for every test (no per-file vi.mock needed).
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@wailsio\/runtime$/, replacement: src("test/wailsRuntimeMock.ts") },
      {
        find: /^@bindings\/github\.com\/gustavofreitas\/kraa\/internal\/app$/,
        replacement: src("test/improveServiceMock.ts"),
      },
      { find: "@bindings", replacement: path.resolve(import.meta.dirname, "./bindings") },
      { find: "@", replacement: path.resolve(import.meta.dirname, "./src") },
    ],
  },
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // @testing-library/react only auto-registers its afterEach(cleanup) when
    // it finds a *global* `afterEach` (it does a bare `typeof afterEach`
    // check) — without this, DOM from one test leaks into the next.
    globals: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/components/ui/**", "src/test/**", "src/**/*.test.{ts,tsx}", "src/vite-env.d.ts", "src/main.tsx"],
      reporter: ["text-summary", "html"],
      // Floors measured on 2026-09-27 (92.38/87.15/90.09/92.8). Raise, never lower.
      thresholds: { statements: 92, branches: 87, functions: 90, lines: 92 },
    },
  },
});
```

- [ ] **Step 7: Remover `vi.mock` duplicados dos testes**

Em cada arquivo com `vi.mock("@wailsio/runtime", ...)` e `vi.mock("@bindings/github.com/gustavofreitas/kraa/internal/app", ...)` (App.test.tsx:5-13, useImprove.test.ts:4-12, ProfileWindow.test.tsx:5-13, e quaisquer outros — `grep -rln "vi.mock(\"@wailsio" frontend/src`), apagar os dois blocos e as chamadas manuais `resetWailsMock()`/`resetImproveServiceMock()` nos `beforeEach` (o `setup.ts` já faz). Manter os imports de `emit` e `ImproveService` de `src/test/*`.

Run: `npm test && npm run coverage && npm run typecheck && npm run lint`
Expected: 92 testes passam; thresholds respeitados; typecheck e lint limpos.

- [ ] **Step 8: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/eslint.config.js frontend/vitest.config.ts frontend/src
git commit -m "test(frontend): cobertura v8, typecheck, ESLint e mocks do Wails centralizados e tipados"
```

---

### Task 5: Lacunas do frontend, warnings de `act()` e organização

**Files:**
- Create: `frontend/src/components/ModelPicker.test.tsx`
- Create: `frontend/src/view.ts`, `frontend/src/view.test.ts`; Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/hooks/useImprove.test.ts`, `frontend/src/profile/ProfileWindow.test.tsx`, `frontend/src/components/Footer.test.tsx`, `frontend/src/components/ActionList.test.tsx`, `frontend/src/components/PreviewPane.test.tsx`
- Split: `frontend/src/App.test.tsx` → `frontend/src/app/*.test.tsx` (ver Step 7)
- Modify: `frontend/vitest.config.ts` (subir thresholds)

**Interfaces:**
- Consumes (Task 4): alias global dos mocks, `emit`, `ImproveService`, `npm run coverage`.
- Produces: `export function isProfileView(search: string): boolean` e `export function syncColorScheme(query: MediaQueryList, root: HTMLElement): () => void` em `src/view.ts`.

- [ ] **Step 1: `ModelPicker.test.tsx` (código já existe; testes devem passar — se não, bug real)**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ModelPicker } from "./ModelPicker";

describe("ModelPicker", () => {
  it("desabilita o select quando não há modelos nem modelo atual", () => {
    render(<ModelPicker model="" models={[]} error="" disabled={false} onChange={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "Modelo" })).toBeDisabled();
  });

  it("põe o modelo atual primeiro quando o provider não o lista", () => {
    render(<ModelPicker model="llama3.2" models={["a", "b"]} error="" disabled={false} onChange={vi.fn()} />);
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["llama3.2", "a", "b"]);
  });

  it("não duplica o modelo atual quando ele já está na lista", () => {
    render(<ModelPicker model="a" models={["a", "b"]} error="" disabled={false} onChange={vi.fn()} />);
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("chama onChange só quando o modelo muda", async () => {
    const onChange = vi.fn();
    render(<ModelPicker model="a" models={["a", "b"]} error="" disabled={false} onChange={onChange} />);
    const select = screen.getByRole("combobox", { name: "Modelo" });
    await userEvent.selectOptions(select, "a");
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.selectOptions(select, "b");
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("mostra o erro como status", () => {
    render(<ModelPicker model="a" models={[]} error="Ollama parado" disabled={false} onChange={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Ollama parado");
  });

  it("respeita disabled", () => {
    render(<ModelPicker model="a" models={["a"]} error="" disabled onChange={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "Modelo" })).toBeDisabled();
  });
});
```

Run: `npm --prefix frontend test -- ModelPicker` → PASS.

- [ ] **Step 2: `useImprove` — modelos, `Start` rejeitado, corrida com `selection:new`, desmontagem**

Adicionar em `useImprove.test.ts` (usa `renderHook`, `act`, `waitFor`, `emit`, `ImproveService`):

```ts
describe("modelos", () => {
  it("setModel com sucesso atualiza o modelo e limpa modelSaving", async () => {
    const { result } = renderHook(() => useImprove());
    await act(() => result.current.setModel("fake-b"));
    expect(ImproveService.SetModel).toHaveBeenCalledWith("fake-b");
    expect(result.current.model).toBe("fake-b");
    expect(result.current.modelSaving).toBe(false);
    expect(result.current.modelsError).toBe("");
  });

  it("setModel com erro mostra modelsError e mantém o modelo", async () => {
    ImproveService.SetModel.mockRejectedValueOnce(new Error("Não foi possível salvar o modelo: disco cheio"));
    const { result } = renderHook(() => useImprove());
    await act(() => result.current.setModel("fake-b"));
    expect(result.current.modelsError).toBe("Não foi possível salvar o modelo: disco cheio");
    expect(result.current.modelSaving).toBe(false);
    expect(result.current.model).not.toBe("fake-b");
  });

  it("ListModels rejeitado deixa a lista vazia com o erro", async () => {
    ImproveService.ListModels.mockRejectedValueOnce(new Error("Não foi possível conectar"));
    const { result } = renderHook(() => useImprove());
    await waitFor(() => expect(result.current.modelsError).toBe("Não foi possível conectar"));
    expect(result.current.models).toEqual([]);
  });

  it("ListModels null vira lista vazia", async () => {
    ImproveService.ListModels.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useImprove());
    await waitFor(() => expect(ImproveService.ListModels).toHaveBeenCalled());
    expect(result.current.models).toEqual([]);
  });
});

it("Start rejeitado vira status error com a mensagem", async () => {
  ImproveService.Start.mockRejectedValueOnce(new Error("O texto está vazio."));
  const { result } = renderHook(() => useImprove());
  await act(async () => result.current.start({ actionId: "a1" }));
  await waitFor(() => expect(result.current.status).toBe("error"));
  expect(result.current.requestError).toBe("O texto está vazio.");
});

it("retry sem pedido anterior não chama Start", () => {
  const { result } = renderHook(() => useImprove());
  act(() => result.current.retry());
  expect(ImproveService.Start).not.toHaveBeenCalled();
});

it("setOutput edita o resultado", () => {
  const { result } = renderHook(() => useImprove());
  act(() => result.current.setOutput("editado"));
  expect(result.current.output).toBe("editado");
});

it("GetState rejeitado não quebra o hook", async () => {
  ImproveService.GetState.mockRejectedValueOnce(new Error("boom"));
  const { result } = renderHook(() => useImprove());
  await waitFor(() => expect(ImproveService.GetState).toHaveBeenCalled());
  expect(result.current.status).toBe("idle");
});

it("GetState com actions null vira lista vazia", async () => {
  ImproveService.GetState.mockResolvedValueOnce({ text: "", actions: null, canReplace: true, warning: "", error: "", model: "" });
  const { result } = renderHook(() => useImprove());
  await waitFor(() => expect(ImproveService.GetState).toHaveBeenCalled());
  expect(result.current.actions).toEqual([]);
});

it("desmontar remove os listeners de eventos", async () => {
  const { unmount, result } = renderHook(() => useImprove());
  await waitFor(() => expect(ImproveService.GetState).toHaveBeenCalled());
  unmount();
  emit("improve:chunk", { id: "req-1", text: "depois" }); // não pode lançar nem atualizar
  expect(result.current.output).toBe("");
});
```

Se o comportamento de `GetState` rejeitado (`useImprove.ts:222`) for diferente de "fica idle" (ex.: grava `configError`), ajustar a asserção **ao código** e registrar no commit. O teste "selection:new com Start pendente" já existe no bloco R12 (`useImprove.test.ts:294-474`) — conferir antes de duplicar; se não existir, adicionar seguindo o helper de corrida desse bloco.

- [ ] **Step 3: `App` — Fechar, `⌘⇧C` com sucesso, `⌘Enter` no preview, alerts juntos**

No arquivo de App correspondente (ver Step 7), seguindo os helpers já existentes (`actions`, `renderApp` ou equivalente):

```tsx
it("botão Fechar chama Close", async () => {
  render(<App />);
  await userEvent.click(await screen.findByRole("button", { name: "Fechar" }));
  expect(ImproveService.Close).toHaveBeenCalled();
});

it("⌘⇧C copia o resultado quando há saída", async () => {
  // montar estado "done" com saída, com o mesmo helper do teste de ⌘⇧C desabilitado (App.test.tsx:231)
  await userEvent.keyboard("{Meta>}{Shift>}c{/Shift}{/Meta}");
  expect(ImproveService.Copy).toHaveBeenCalledWith("resultado");
});

it("⌘Enter com foco no preview substitui", async () => {
  // estado "done"; focar a Pré-visualização
  await userEvent.click(screen.getByLabelText("Pré-visualização"));
  await userEvent.keyboard("{Meta>}{Enter}{/Meta}");
  expect(ImproveService.Replace).toHaveBeenCalledWith("resultado");
});

it("erro de ação e erro do pedido aparecem juntos", async () => {
  // improve:error + Copy rejeitado
  ImproveService.Copy.mockRejectedValueOnce(new Error("Não foi possível copiar para a área de transferência."));
  // ... disparar erro do pedido via emit("improve:error", { id, message: "Falhou" }) e clicar Copiar ...
  expect(screen.getAllByRole("alert")).toHaveLength(2);
});
```

Os comentários marcam onde reaproveitar o setup de estado "done" que já existe no arquivo (buscar por `improve:done` no `App.test.tsx`); não inventar um helper novo se já houver um.

- [ ] **Step 4: `ProfileWindow`, `Footer`, `ActionList`, `PreviewPane`**

```tsx
// ProfileWindow.test.tsx
it("GetProfile rejeitado mostra o erro e mantém a janela utilizável", async () => {
  ImproveService.GetProfile.mockRejectedValueOnce(new Error("config ilegível"));
  render(<ProfileWindow />);
  expect(await screen.findByText(/config ilegível/)).toBeInTheDocument();
});

it("Salvar fica desabilitado enquanto salva", async () => {
  let resolve!: () => void;
  ImproveService.SaveProfile.mockReturnValueOnce(new Promise<void>((r) => (resolve = r)));
  render(<ProfileWindow />);
  const save = await screen.findByRole("button", { name: "Salvar" });
  await userEvent.click(save);
  expect(save).toBeDisabled();
  await act(async () => resolve());
  expect(save).toBeEnabled();
});

it("contador mostra n/2000 e limita o texto", async () => {
  render(<ProfileWindow />);
  const box = await screen.findByRole("textbox", { name: "Sobre você" });
  await userEvent.clear(box);
  await userEvent.type(box, "abc");
  expect(screen.getByText("3/2000")).toBeInTheDocument();
  expect(box).toHaveAttribute("maxLength", "2000");
});

it("envia enabled marcado ao salvar", async () => {
  render(<ProfileWindow />);
  await userEvent.click(await screen.findByRole("checkbox", { name: "Usar perfil" }));
  await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
  expect(ImproveService.SaveProfile).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
});
```

Se o texto do erro de `GetProfile` rejeitado não for renderizado (`ProfileWindow.tsx:29`), ajustar a asserção ao comportamento real. Footer: teclas com modificador (`{Meta>}{ArrowRight}{/Meta}`) não trocam o botão focado (`Footer.tsx:47`); `onBlur` da barra devolve a dica (`Footer.tsx:85-87`). ActionList: mudar `focusToken` re-foca a busca (`rerender` com token novo → `expect(search).toHaveFocus()`); mudar o filtro volta o destaque ao primeiro item. PreviewPane: editar o campo editável chama `onChange` com o texto digitado.

- [ ] **Step 5: Extrair `src/view.ts` do `main.tsx` (TDD)**

`src/view.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { isProfileView, syncColorScheme } from "./view";

describe("isProfileView", () => {
  it.each([
    ["?view=profile", true],
    ["?view=modal", false],
    ["", false],
    ["?x=1&view=profile", true],
  ])("%s → %s", (search, want) => expect(isProfileView(search)).toBe(want));
});

describe("syncColorScheme", () => {
  it("aplica e acompanha a preferência do SO", () => {
    let listener: (() => void) | undefined;
    const query = {
      matches: true,
      addEventListener: vi.fn((_: string, l: () => void) => (listener = l)),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList;
    const root = document.createElement("html");

    const stop = syncColorScheme(query, root);
    expect(root.classList.contains("dark")).toBe(true);

    (query as { matches: boolean }).matches = false;
    listener!();
    expect(root.classList.contains("dark")).toBe(false);

    stop();
    expect(query.removeEventListener).toHaveBeenCalledWith("change", listener);
  });
});
```

Run → FAIL. `src/view.ts`:

```ts
// The tray's "Perfil do usuário…" window loads the same bundle with
// ?view=profile (see main.go).
export function isProfileView(search: string): boolean {
  return new URLSearchParams(search).get("view") === "profile";
}

// The window has no OS chrome to inherit a theme from, so mirror the OS
// light/dark preference onto the `dark` class ourselves and keep it in sync.
export function syncColorScheme(query: MediaQueryList, root: HTMLElement): () => void {
  const apply = () => root.classList.toggle("dark", query.matches);
  apply();
  query.addEventListener("change", apply);
  return () => query.removeEventListener("change", apply);
}
```

`src/main.tsx`:

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ProfileWindow } from './profile/ProfileWindow'
import { isProfileView, syncColorScheme } from './view'
import './index.css'

syncColorScheme(window.matchMedia('(prefers-color-scheme: dark)'), document.documentElement)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {isProfileView(window.location.search) ? <ProfileWindow /> : <App />}
  </React.StrictMode>,
)
```

Run → PASS.

- [ ] **Step 6: Zerar os warnings de `act()`**

Run: `npm --prefix frontend test 2>&1 | grep -c "not wrapped in act"` — linha de base: 18 (13 Footer, 4 useImprove, 1 App), mais 1 "environment not configured to support act".
Correções: (a) em testes de teclado, trocar `fireEvent.focus/keyDown` soltos por `await userEvent.keyboard(...)`/`await userEvent.tab()` (o userEvent já envolve em act); (b) `emit(...)` fora de act → `act(() => emit(...))`; (c) `App.test.tsx:114-118`: remover o `act()` em volta de `userEvent` (o userEvent não deve ficar dentro de act). Expected: o grep retorna `0` e não há "environment not configured".

- [ ] **Step 7: Dividir o `App.test.tsx` (627 linhas)**

Criar `frontend/src/app/` com um arquivo por `describe` de primeiro nível existente (ex.: `shortcuts.test.tsx`, `keyboard.test.tsx`, `model.test.tsx`, `mascot.test.tsx`, `errors.test.tsx` — usar os nomes reais dos `describe`), mais `frontend/src/app/helpers.tsx` com os fixtures/helpers compartilhados (`actions`, montagem de estado "done" etc.). Mover sem alterar asserções. Ajustar imports (`../App`, `../test/...`). Apagar `App.test.tsx`. Mesmo tratamento opcional para o bloco R12 de `useImprove.test.ts` → `hooks/useImprove.race.test.ts`.
Run: `npm --prefix frontend test` → mesma contagem de testes de antes + os novos.

- [ ] **Step 8: Subir os thresholds**

Run: `npm --prefix frontend run coverage`. Atualizar `thresholds` no `vitest.config.ts` para o **piso inteiro** de cada métrica medida (ex.: 95.6 → 95), nunca abaixo dos valores atuais (92/87/90/92). Atualizar o comentário com a data e os números.

- [ ] **Step 9: Commit**

```bash
git add frontend
git commit -m "test(frontend): ModelPicker, modelos no hook, perfil, view.ts; sem warnings de act()"
```

---

### Task 6: Lacunas e cobertura da CLI npm

**Files:**
- Modify: `npm/package.json`, `npm/package-lock.json`, `npm/vitest.config.ts`
- Modify: `npm/test/cli.test.ts`, `npm/test/install.test.ts`, `npm/test/doctor.test.ts`
- Create: `npm/test/exec.test.ts`, `npm/test/pkg.test.ts`

**Interfaces:**
- Produces: script `npm run coverage` (usado na Task 10). Nada mais.

- [ ] **Step 1: Dependência, script e config**

```bash
cd npm && npm i -D @vitest/coverage-v8@^5
```

`package.json` → `"coverage": "vitest run --coverage"`. `vitest.config.ts`: dentro de `test`, adicionar

```ts
coverage: {
  provider: "v8",
  include: ["src/**/*.ts"],
  reporter: ["text-summary", "html"],
  // Set in Step 6 to the measured floors after this task's tests.
  thresholds: { statements: 84, branches: 82, functions: 71, lines: 86 },
},
```

Run: `npm run coverage` → PASS (números ≥ 84.66/82.6/71.18/86.12).

- [ ] **Step 2: `realCommandExists`, `readPackageJson`, `realExec`, `realSpawnDetached`**

`npm/test/doctor.test.ts` (acrescentar):

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { realCommandExists } from "../src/doctor";

describe("realCommandExists", () => {
  it("acha executável no PATH e ignora entradas vazias", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kraa-path-"));
    const name = process.platform === "win32" ? "ferramenta.EXE" : "ferramenta";
    fs.writeFileSync(path.join(dir, name), "", { mode: 0o755 });
    const env = { PATH: ["", dir].join(path.delimiter), PATHEXT: ".EXE" };
    await expect(realCommandExists("ferramenta", env)).resolves.toBe(true);
    await expect(realCommandExists("inexistente", env)).resolves.toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("PATH ausente → false", async () => {
    await expect(realCommandExists("qualquer", {})).resolves.toBe(false);
  });
});
```

`npm/test/pkg.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readPackageJson } from "../src/pkg";
import pkg from "../package.json";

describe("readPackageJson", () => {
  it("lê o package.json do pacote", () => {
    expect(readPackageJson().version).toBe(pkg.version);
  });
});
```

(Se o `tsconfig` não tiver `resolveJsonModule`, trocar o import do JSON por `JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"))`.)

`npm/test/exec.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { realExec, realSpawnDetached } from "../src/exec";

describe("realExec", () => {
  it("resolve com código 0", async () => {
    await expect(realExec(process.execPath, ["-e", "process.exit(0)"])).resolves.toBeUndefined();
  });

  it("rejeita com o código de saída", async () => {
    await expect(realExec(process.execPath, ["-e", "process.exit(3)"])).rejects.toThrow("código 3");
  });

  it("rejeita quando o comando não existe", async () => {
    await expect(realExec("kraa-comando-inexistente", [])).rejects.toThrow();
  });
});

describe("realSpawnDetached", () => {
  it("ENOENT vira mensagem no console, sem exceção não tratada", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    realSpawnDetached("kraa-comando-inexistente", []);
    await vi.waitFor(() => expect(err).toHaveBeenCalledWith(expect.stringContaining("Falha ao executar kraa-comando-inexistente")));
    err.mockRestore();
  });
});
```

Run: `npm test` → PASS.

- [ ] **Step 3: `cli.ts` — ramos sem teste**

Em `cli.test.ts`, usando `deps()` e `fakeInstalled()` já existentes:

```ts
it("version e -v imprimem a versão", async () => {
  for (const arg of ["version", "-v"]) {
    const { d, out } = deps();
    await expect(run([arg], d)).resolves.toBe(0);
    expect(out()).toContain("1.2.3");
  }
});

it("trigger sem binário instalado falha com dica de instalar", async () => {
  const { d, out } = deps();
  await expect(run(["trigger"], d)).resolves.not.toBe(0);
  expect(out()).toMatch(/install/i);
});

it("config abre o arquivo no macOS e no Windows", async () => {
  for (const platform of ["darwin", "win32"] as const) {
    const { d } = deps({ platform });
    await run(["config"], d);
    expect(d.spawnDetached).toHaveBeenCalled();
  }
});
```

Para `stop` com sucesso, `start` no win32, `start` com binário ainda ausente após o install e `autostart` com erro/aviso: copiar a estrutura do teste vizinho que cobre o caso oposto (ex.: "stop quando não está rodando", `cli.test.ts:84-93`) invertendo o mock (`exec` resolvendo / rejeitando) e afirmando a saída real impressa por `cli.ts:73`, `:68`, `:97`, `:129-136`. Ler cada ramo antes de escrever a asserção.

- [ ] **Step 4: `install.ts` — `KRAA_SKIP_DOWNLOAD` "0"/"false" e Windows**

```ts
it.each(["0", "false"])("KRAA_SKIP_DOWNLOAD=%s não pula o download", async (v) => {
  // mesmo setup do teste que baixa com sucesso; env: { KRAA_SKIP_DOWNLOAD: v }
  // esperar "installed" e fetch chamado
});
```

Preencher com o setup do teste de download bem-sucedido existente em `install.test.ts` (copiar, não referenciar). Caso Windows: `platform: "win32"` → arquivo `.exe` gravado e **sem** `chmod` (espiar `fs.chmodSync` ou conferir o modo).

- [ ] **Step 5: Rodar**

Run: `npm test && npm run typecheck && npm run coverage` → PASS.

- [ ] **Step 6: Subir thresholds e commitar**

Atualizar `thresholds` para o piso inteiro medido (mínimos: statements 88, branches 82, functions 80, lines 88). Se algum ficar abaixo desses mínimos, adicionar testes ao arquivo com menor cobertura (`npx vitest run --coverage --coverage.reporter=text`) até atingir.

```bash
git add npm
git commit -m "test(npm): cobre exec, pkg, PATH, version/trigger/config e thresholds de cobertura"
```

---

### Task 7: Teste de integração do backend (service → improver → llm → llmfake)

**Files:**
- Create: `internal/app/integration_test.go`

**Interfaces:**
- Consumes: `llmfake.New`, `(*Server).SetScenario`, `(*Server).Requests`, `llmfake.Scenario`, `llmfake.DefaultChunks` (Task 1); `app.NewRunner` (Task 2); `newHarness`-style fakes de `service_test.go` (`fakeEmitter.waitFor`, `isEvent`, `fakeClipboard`, `fakeKeys`, `fakeWindow`, `recorder`, `canSimulate`).
- Produces: nada.

- [ ] **Step 1: Escrever os testes**

```go
package app

import (
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gustavofreitas/kraa/internal/config"
	"github.com/gustavofreitas/kraa/internal/llmfake"
)

type integration struct {
	*harness
	fake *llmfake.Server
	srv  *httptest.Server
	cfg  *config.Config
}

func newIntegration(t *testing.T) *integration {
	t.Helper()
	fake := llmfake.New("fake-a", "fake-b")
	srv := httptest.NewServer(fake)
	t.Cleanup(srv.Close)

	cfg := config.Default()
	cfg.Provider.BaseURL = srv.URL + "/v1"
	cfg.Provider.Model = "fake-a"
	cfg.Provider.TimeoutSeconds = 5

	h := newHarness(t, NewRunner(cfg), canSimulate)
	h.host.Configure(cfg, NewRunner(cfg))
	return &integration{harness: h, fake: fake, srv: srv, cfg: cfg}
}

func firstActionID(t *testing.T, cfg *config.Config, useProfile bool) string {
	t.Helper()
	for _, a := range cfg.Actions {
		if a.UseProfile == useProfile {
			return a.ID
		}
	}
	t.Fatalf("nenhuma ação com use_profile=%v", useProfile)
	return ""
}

func TestIntegrationStreamThenReplaceRestoresClipboard(t *testing.T) {
	it := newIntegration(t)
	it.cb.SetText("original")

	id, err := it.svc.Start(StartRequest{Text: "texto do usuário", ActionID: firstActionID(t, it.cfg, true)})
	if err != nil {
		t.Fatal(err)
	}
	done := it.em.waitFor(t, isEvent(EventDone, id))
	want := strings.Join(llmfake.DefaultChunks, "")
	if got := fmt.Sprint(done.data); !strings.Contains(got, want) {
		t.Fatalf("done = %s, want texto %q", got, want)
	}

	reqs := it.fake.Requests()
	if len(reqs) != 1 || reqs[0].Model != "fake-a" || !strings.Contains(fmt.Sprint(reqs[0].Messages), "texto do usuário") {
		t.Fatalf("requests = %+v", reqs)
	}

	if err := it.svc.Replace(want); err != nil {
		t.Fatal(err)
	}
	if got, _ := it.cb.Text(); got != "original" {
		t.Fatalf("clipboard = %q, want restaurado", got)
	}
}

func TestIntegrationUnauthorizedIsPTBR(t *testing.T) {
	it := newIntegration(t)
	it.fake.SetScenario(llmfake.Scenario{Status: 401, Message: "chave inválida"})
	id, _ := it.svc.Start(StartRequest{Text: "x", ActionID: firstActionID(t, it.cfg, true)})
	ev := it.em.waitFor(t, isEvent(EventError, id))
	if got := fmt.Sprint(ev.data); !strings.Contains(got, "chave inválida — verifique a api_key") {
		t.Fatalf("erro = %s", got)
	}
}

func TestIntegrationServerDownSuggestsOllamaServe(t *testing.T) {
	it := newIntegration(t)
	it.srv.Close()
	id, _ := it.svc.Start(StartRequest{Text: "x", ActionID: firstActionID(t, it.cfg, true)})
	ev := it.em.waitFor(t, isEvent(EventError, id))
	if got := fmt.Sprint(ev.data); !strings.Contains(got, "(ollama serve)") {
		t.Fatalf("erro = %s", got)
	}
}

func TestIntegrationCloseMidStreamCancelsUpstream(t *testing.T) {
	it := newIntegration(t)
	it.fake.SetScenario(llmfake.Scenario{Chunks: []string{"parcial"}, Hang: true})
	id, _ := it.svc.Start(StartRequest{Text: "x", ActionID: firstActionID(t, it.cfg, true)})
	it.em.waitFor(t, isEvent(EventChunk, id))

	it.svc.Close()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if r := it.fake.Requests(); len(r) == 1 && r[0].Canceled {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if r := it.fake.Requests(); len(r) != 1 || !r[0].Canceled {
		t.Fatalf("upstream não cancelado: %+v", r)
	}
	for _, ev := range it.em.snapshot() {
		if (ev.name == EventDone || ev.name == EventError) && eventID(ev) == id {
			t.Fatalf("evento %s depois do Close", ev.name)
		}
	}
}

func TestIntegrationProfileOnlyForProfileActions(t *testing.T) {
	it := newIntegration(t)
	it.cfg.Profile = config.Profile{Enabled: true, Text: "Sou tester de integração"}
	it.host.Configure(it.cfg, NewRunner(it.cfg))

	id, _ := it.svc.Start(StartRequest{Text: "x", ActionID: firstActionID(t, it.cfg, true)})
	it.em.waitFor(t, isEvent(EventDone, id))
	id, _ = it.svc.Start(StartRequest{Text: "x", ActionID: firstActionID(t, it.cfg, false)})
	it.em.waitFor(t, isEvent(EventDone, id))

	reqs := it.fake.Requests()
	if len(reqs) != 2 {
		t.Fatalf("requests = %d", len(reqs))
	}
	if !strings.Contains(fmt.Sprint(reqs[0].Messages), "Sou tester de integração") {
		t.Error("ação com use_profile não recebeu o perfil")
	}
	if strings.Contains(fmt.Sprint(reqs[1].Messages), "Sou tester de integração") {
		t.Error("ação sem use_profile recebeu o perfil")
	}
}

func TestIntegrationListModelsFromProvider(t *testing.T) {
	it := newIntegration(t)
	models, err := it.svc.ListModels()
	if err != nil || strings.Join(models, ",") != "fake-a,fake-b" {
		t.Fatalf("models=%v err=%v", models, err)
	}
}
```

Ajustes esperados ao ler o código: o nome do campo de ação (`a.UseProfile`) e do payload de `DoneEvent`/`ErrorEvent` (use `eventID(ev)` e os campos reais em vez de `fmt.Sprint` se ficar mais claro). Se `Replace` exigir `FocusDelay`/`Sleep` do harness, o `newHarness` já injeta.

- [ ] **Step 2: Rodar**

Run: `go test -race -count=3 ./internal/app/ -run Integration`
Expected: PASS nas 3 execuções. Falha aqui é bug real de integração — debugar antes de mexer no teste.

- [ ] **Step 3: Commit**

```bash
git add internal/app/integration_test.go
git commit -m "test(app): integração do service com improver e llm contra o llmfake"
```

---

### Task 8: Seam de E2E — fakes em memória, `/__e2e/*` e `main_server.go`

**Files:**
- Create: `internal/e2e/e2e.go`, `internal/e2e/e2e_test.go`
- Create: `main_server.go`
- Modify: `main.go` (só adicionar `//go:build !server` na primeira linha)

**Interfaces:**
- Consumes (Task 2): `app.LoadStartupConfig`, `app.LoadConfig`, `app.NewRunner`, `app.NewReloader`, `app.ReloaderOptions`, `(*Reloader).RegisterHotkey/Reload/SaveModel/SaveProfile`, `app.New`, `app.Options`, `app.WailsEmitter`; `platform.Session`.
- Produces (Task 9 depende destes endpoints e payloads, exatamente):
  - `POST /__e2e/trigger` corpo `{"selection": "texto"}` ou `{}` (sem seleção) → 204. Roda `Host.Trigger()` (captura real via `platform.Capture` com as fakes).
  - `POST /__e2e/session` corpo `{"canReplace": bool, "reason": "…"}` → 204.
  - `POST /__e2e/clipboard` corpo `{"text": "…"}` → 204.
  - `GET /__e2e/state` → `{"clipboard": string, "hasClipboard": bool, "pasted": [string], "window": {"visible": bool, "shows": int, "hides": int}, "profileWindow": {…mesmo formato…}}`.
  - `POST /__e2e/reset` → 204; limpa clipboard, colagens, seleção, contadores de janela, restaura sessão `canReplace: true` e chama `Reload` (relê o `config.yaml`).
  - Tipos Go: `e2e.Clipboard`, `e2e.Keys`, `e2e.Window`, `e2e.Shortcuts`, `e2e.Hooks`, `e2e.NewHooks() *Hooks`, `(*Hooks).Middleware(next http.Handler) http.Handler`, `(*Hooks).Session() platform.Session`, campos `Hooks.Host e2e.Host` e `Hooks.Reload func()`; `type Host interface { Trigger(); SetSession(platform.Session) }`.
  - Binário: `CGO_ENABLED=0 go build -tags server -o bin/kraa-e2e .` (Linux/macOS; no macOS o `CGO_ENABLED` pode ficar padrão).

- [ ] **Step 1: Testes de `internal/e2e` (falham)**

```go
package e2e_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gustavofreitas/kraa/internal/e2e"
	"github.com/gustavofreitas/kraa/internal/platform"
)

type fakeHost struct {
	h        *e2e.Hooks
	triggers int
	captured string
	session  platform.Session
}

// Trigger mirrors Host.Trigger's capture through the real platform.Capture.
func (f *fakeHost) Trigger() {
	f.triggers++
	text, restore, _ := platform.Capture(f.h.Clipboard, f.h.Keys, 50*time.Millisecond)
	restore()
	f.captured = text
	f.h.Window.Show()
}

func (f *fakeHost) SetSession(s platform.Session) { f.session = s }

func setup(t *testing.T) (*e2e.Hooks, *fakeHost, http.Handler, *int) {
	t.Helper()
	h := e2e.NewHooks()
	host := &fakeHost{h: h}
	h.Host = host
	reloads := 0
	h.Reload = func() { reloads++ }
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(299) })
	return h, host, h.Middleware(next), &reloads
}

func do(t *testing.T, hd http.Handler, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	hd.ServeHTTP(rec, httptest.NewRequest(method, path, strings.NewReader(body)))
	return rec
}

func TestNonE2EPathsGoToNext(t *testing.T) {
	_, _, hd, _ := setup(t)
	if rec := do(t, hd, "GET", "/", ""); rec.Code != 299 {
		t.Fatalf("code = %d", rec.Code)
	}
}

func TestTriggerWithSelectionCapturesIt(t *testing.T) {
	h, host, hd, _ := setup(t)
	h.Clipboard.SetText("anterior")
	if rec := do(t, hd, "POST", "/__e2e/trigger", `{"selection":"texto selecionado"}`); rec.Code != http.StatusNoContent {
		t.Fatalf("code = %d", rec.Code)
	}
	if host.captured != "texto selecionado" {
		t.Fatalf("captured = %q", host.captured)
	}
	if got, _ := h.Clipboard.Text(); got != "anterior" {
		t.Fatalf("clipboard não restaurado: %q", got)
	}
	if !h.Window.IsVisible() {
		t.Fatal("janela não exibida")
	}
}

func TestTriggerWithoutSelectionCapturesNothing(t *testing.T) {
	_, host, hd, _ := setup(t)
	do(t, hd, "POST", "/__e2e/trigger", `{}`)
	if host.triggers != 1 || host.captured != "" {
		t.Fatalf("triggers=%d captured=%q", host.triggers, host.captured)
	}
}

func TestPasteIsRecordedAndStateReported(t *testing.T) {
	h, _, hd, _ := setup(t)
	h.Clipboard.SetText("original")
	if err := platform.Paste(h.Clipboard, h.Keys, "resultado", 0); err != nil {
		t.Fatal(err)
	}
	h.Window.Show()
	h.Window.Hide()

	rec := do(t, hd, "GET", "/__e2e/state", "")
	var st struct {
		Clipboard    string   `json:"clipboard"`
		HasClipboard bool     `json:"hasClipboard"`
		Pasted       []string `json:"pasted"`
		Window       struct {
			Visible      bool `json:"visible"`
			Shows, Hides int
		} `json:"window"`
	}
	json.NewDecoder(rec.Body).Decode(&st)
	if st.Clipboard != "original" || !st.HasClipboard || len(st.Pasted) != 1 || st.Pasted[0] != "resultado" {
		t.Fatalf("state = %+v", st)
	}
	if st.Window.Visible || st.Window.Shows != 1 || st.Window.Hides != 1 {
		t.Fatalf("window = %+v", st.Window)
	}
}

func TestSessionAndClipboardEndpoints(t *testing.T) {
	h, host, hd, _ := setup(t)
	do(t, hd, "POST", "/__e2e/session", `{"canReplace":false,"reason":"Sem Acessibilidade"}`)
	want := platform.Session{CanSimulateKeys: false, Reason: "Sem Acessibilidade"}
	if host.session != want || h.Session() != want {
		t.Fatalf("session host=%+v hooks=%+v", host.session, h.Session())
	}
	do(t, hd, "POST", "/__e2e/clipboard", `{"text":"colado antes"}`)
	if got, _ := h.Clipboard.Text(); got != "colado antes" {
		t.Fatalf("clipboard = %q", got)
	}
}

func TestResetClearsEverythingAndReloads(t *testing.T) {
	h, host, hd, reloads := setup(t)
	h.Clipboard.SetText("x")
	platform.Paste(h.Clipboard, h.Keys, "y", 0)
	h.Window.Show()
	do(t, hd, "POST", "/__e2e/session", `{"canReplace":false}`)

	if rec := do(t, hd, "POST", "/__e2e/reset", ""); rec.Code != http.StatusNoContent {
		t.Fatalf("code = %d", rec.Code)
	}
	if _, ok := h.Clipboard.Text(); ok || len(h.Keys.Pasted()) != 0 || h.Window.IsVisible() {
		t.Fatal("reset incompleto")
	}
	if !host.session.CanSimulateKeys || !h.Session().CanSimulateKeys {
		t.Fatal("sessão não restaurada")
	}
	if *reloads != 1 {
		t.Fatalf("reloads = %d", *reloads)
	}
}

func TestWrongMethodAndUnknownPath(t *testing.T) {
	_, _, hd, _ := setup(t)
	if rec := do(t, hd, "GET", "/__e2e/trigger", ""); rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("code = %d", rec.Code)
	}
	if rec := do(t, hd, "GET", "/__e2e/nada", ""); rec.Code != http.StatusNotFound {
		t.Fatalf("code = %d", rec.Code)
	}
}

func TestShortcutsAlwaysAccept(t *testing.T) {
	var s e2e.Shortcuts
	if err := s.Register("CmdOrCtrl+Shift+Y", func() {}); err != nil || !s.IsRegistered("CmdOrCtrl+Shift+Y") {
		t.Fatal("Register/IsRegistered")
	}
	s.Unregister("CmdOrCtrl+Shift+Y")
	if s.IsRegistered("CmdOrCtrl+Shift+Y") {
		t.Fatal("Unregister")
	}
}
```

Run: `go test ./internal/e2e/` → FAIL (`undefined: e2e.NewHooks`).

- [ ] **Step 2: Implementar `internal/e2e/e2e.go`**

```go
// Package e2e holds the in-memory fakes and HTTP hooks used only by the
// server-mode build (main_server.go, `go build -tags server`) so the
// Playwright suite can drive the real ImproveService: simulated selection
// capture and paste, window visibility and session. It must not import
// Wails and is never wired into the desktop build.
package e2e

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync"

	"github.com/gustavofreitas/kraa/internal/platform"
)

// Clipboard is an in-memory platform.Clipboard.
type Clipboard struct {
	mu   sync.Mutex
	text string
	has  bool
}

func (c *Clipboard) Text() (string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.text, c.has
}

func (c *Clipboard) SetText(s string) bool {
	c.mu.Lock()
	c.text, c.has = s, true
	c.mu.Unlock()
	return true
}

func (c *Clipboard) clear() { c.mu.Lock(); c.text, c.has = "", false; c.mu.Unlock() }

// Keys simulates the OS copy/paste keystrokes against Clipboard: Copy puts
// the pending selection (if any) on it; Paste records what is on it.
type Keys struct {
	cb        *Clipboard
	mu        sync.Mutex
	selection *string
	pasted    []string
}

func (k *Keys) setSelection(s *string) { k.mu.Lock(); k.selection = s; k.mu.Unlock() }

func (k *Keys) Copy() error {
	k.mu.Lock()
	sel := k.selection
	k.mu.Unlock()
	if sel != nil {
		k.cb.SetText(*sel)
	}
	return nil
}

func (k *Keys) Paste() error {
	t, _ := k.cb.Text()
	k.mu.Lock()
	k.pasted = append(k.pasted, t)
	k.mu.Unlock()
	return nil
}

func (k *Keys) Pasted() []string {
	k.mu.Lock()
	defer k.mu.Unlock()
	return append([]string{}, k.pasted...)
}

func (k *Keys) reset() { k.mu.Lock(); k.selection, k.pasted = nil, nil; k.mu.Unlock() }

// Window records visibility for app.Window.
type Window struct {
	mu           sync.Mutex
	visible      bool
	shows, hides int
}

func (w *Window) Show()        { w.mu.Lock(); w.visible = true; w.shows++; w.mu.Unlock() }
func (w *Window) Hide()        { w.mu.Lock(); w.visible = false; w.hides++; w.mu.Unlock() }
func (w *Window) ReleaseFocus() {}
func (w *Window) IsVisible() bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.visible
}

type windowState struct {
	Visible bool `json:"visible"`
	Shows   int  `json:"shows"`
	Hides   int  `json:"hides"`
}

func (w *Window) state() windowState {
	w.mu.Lock()
	defer w.mu.Unlock()
	return windowState{w.visible, w.shows, w.hides}
}

func (w *Window) reset() { w.mu.Lock(); w.visible, w.shows, w.hides = false, 0, 0; w.mu.Unlock() }

// Shortcuts is an app.Shortcuts that always accepts (server mode has no
// global hotkeys; Wails' own registry would always reject).
type Shortcuts struct {
	mu         sync.Mutex
	registered map[string]bool
}

func (s *Shortcuts) Register(a string, _ func()) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.registered == nil {
		s.registered = map[string]bool{}
	}
	s.registered[a] = true
	return nil
}

func (s *Shortcuts) Unregister(a string) error {
	s.mu.Lock()
	delete(s.registered, a)
	s.mu.Unlock()
	return nil
}

func (s *Shortcuts) IsRegistered(a string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.registered[a]
}

// Host is the part of *app.Host the hooks drive.
type Host interface {
	Trigger()
	SetSession(platform.Session)
}

type Hooks struct {
	Clipboard     *Clipboard
	Keys          *Keys
	Window        *Window
	ProfileWindow *Window
	Host          Host   // set after app.New, before Run
	Reload        func() // re-reads config.yaml; set after the Reloader exists

	mu      sync.Mutex
	session platform.Session
}

func NewHooks() *Hooks {
	cb := &Clipboard{}
	return &Hooks{
		Clipboard:     cb,
		Keys:          &Keys{cb: cb},
		Window:        &Window{},
		ProfileWindow: &Window{},
		session:       platform.Session{CanSimulateKeys: true},
	}
}

// Session is the simulated session (DetectSession for the server build).
func (h *Hooks) Session() platform.Session {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.session
}

func (h *Hooks) setSession(s platform.Session) {
	h.mu.Lock()
	h.session = s
	h.mu.Unlock()
	h.Host.SetSession(s)
}

// Middleware serves /__e2e/* and passes everything else to next
// (application.AssetOptions.Middleware).
func (h *Hooks) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/__e2e/") {
			next.ServeHTTP(w, r)
			return
		}
		h.serve(w, r)
	})
}

func (h *Hooks) serve(w http.ResponseWriter, r *http.Request) {
	route := map[string]string{
		"/__e2e/trigger":   http.MethodPost,
		"/__e2e/session":   http.MethodPost,
		"/__e2e/clipboard": http.MethodPost,
		"/__e2e/reset":     http.MethodPost,
		"/__e2e/state":     http.MethodGet,
	}
	method, ok := route[r.URL.Path]
	if !ok {
		http.NotFound(w, r)
		return
	}
	if r.Method != method {
		http.Error(w, "método não permitido", http.StatusMethodNotAllowed)
		return
	}

	switch r.URL.Path {
	case "/__e2e/trigger":
		var body struct {
			Selection *string `json:"selection"`
		}
		if !decode(w, r, &body) {
			return
		}
		h.Keys.setSelection(body.Selection)
		h.Host.Trigger()
	case "/__e2e/session":
		var body struct {
			CanReplace bool   `json:"canReplace"`
			Reason     string `json:"reason"`
		}
		if !decode(w, r, &body) {
			return
		}
		h.setSession(platform.Session{CanSimulateKeys: body.CanReplace, Reason: body.Reason})
	case "/__e2e/clipboard":
		var body struct {
			Text string `json:"text"`
		}
		if !decode(w, r, &body) {
			return
		}
		h.Clipboard.SetText(body.Text)
	case "/__e2e/reset":
		h.Clipboard.clear()
		h.Keys.reset()
		h.Window.reset()
		h.ProfileWindow.reset()
		h.setSession(platform.Session{CanSimulateKeys: true})
		if h.Reload != nil {
			h.Reload()
		}
	case "/__e2e/state":
		text, has := h.Clipboard.Text()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"clipboard":     text,
			"hasClipboard":  has,
			"pasted":        h.Keys.Pasted(),
			"window":        h.Window.state(),
			"profileWindow": h.ProfileWindow.state(),
		})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// decode reads an optional JSON body ("" is treated as {}).
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	if r.ContentLength == 0 {
		return true
	}
	if err := json.NewDecoder(r.Body).Decode(v); err != nil && !errors.Is(err, io.EOF) {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return false
	}
	return true
}
```

Nota: em `httptest.NewRequest` com corpo não vazio o `ContentLength` é preenchido; o teste de reset manda corpo vazio. Run: `go test -race ./internal/e2e/` → PASS.

- [ ] **Step 3: Tag no `main.go`**

Primeira linha de `main.go`: `//go:build !server` seguida de linha em branco antes de `package main`.

- [ ] **Step 4: Criar `main_server.go`**

```go
//go:build server

// Server-mode entrypoint used only by the E2E suite (e2e/). It serves the
// same frontend to a browser over HTTP (Wails server mode) with the real
// ImproveService → improver → llm stack, and replaces everything that needs
// the desktop (clipboard, keystrokes, windows, hotkeys, Accessibility) with
// internal/e2e fakes driven through /__e2e/*. Never shipped: release builds
// don't use the `server` tag.
package main

import (
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/gustavofreitas/kraa/internal/app"
	"github.com/gustavofreitas/kraa/internal/e2e"
)

func main() {
	hooks := e2e.NewHooks()

	wailsApp := application.New(application.Options{
		Name:        "kraa",
		Description: "Kraa (server mode, E2E)",
		Assets: application.AssetOptions{
			Handler:    application.AssetFileServerFS(assets),
			Middleware: hooks.Middleware,
		},
	})

	cfg, cfgPath, cfgErrMsg := app.LoadStartupConfig(app.LoadConfig)

	svc, host := app.New(app.Options{
		Config:        cfg,
		Runner:        app.NewRunner(cfg),
		Emitter:       app.WailsEmitter{App: wailsApp},
		Clipboard:     hooks.Clipboard,
		Keys:          hooks.Keys,
		Window:        hooks.Window,
		ProfileWindow: hooks.ProfileWindow,
		Session:       hooks.Session(),
	})
	hooks.Host = host
	wailsApp.RegisterService(application.NewService(svc))

	if cfgErrMsg != "" {
		host.SetError(cfgErrMsg)
	}

	reloader := app.NewReloader(app.ReloaderOptions{
		Host:          host,
		Shortcuts:     &e2e.Shortcuts{},
		Load:          app.LoadConfig,
		NewRunner:     app.NewRunner,
		DetectSession: hooks.Session,
		OnHotkey:      host.Trigger,
		Hotkey:        cfg.Hotkey,
		ConfigPath:    cfgPath,
	})
	reloader.RegisterHotkey()
	hooks.Reload = reloader.Reload
	host.SetModelSaver(reloader.SaveModel)
	host.SetProfileSaver(reloader.SaveProfile)

	if err := wailsApp.Run(); err != nil {
		log.Fatal(err)
	}
}
```

- [ ] **Step 5: Build e vet das duas variantes**

```bash
gofmt -l . && go vet ./... && go vet -tags server ./... && go build -o /dev/null . && go build -tags server -o bin/kraa-e2e . && GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -tags server -o /dev/null .
```
Expected: tudo exit 0 (no Linux acrescentar `-tags gtk3` só nos comandos sem `server`).

- [ ] **Step 6: Smoke manual do binário server (com o llmfake da Task 1)**

```bash
npm --prefix frontend run build
T=$(mktemp -d); mkdir -p "$T/Library/Application Support/kraa" "$T/.config/kraa"
printf 'provider:\n  base_url: "http://127.0.0.1:18766/v1"\n  model: "fake-a"\n' | tee "$T/Library/Application Support/kraa/config.yaml" > "$T/.config/kraa/config.yaml"
go run ./cmd/llmfake & LLM=$!
HOME=$T XDG_CONFIG_HOME=$T/.config WAILS_SERVER_HOST=127.0.0.1 WAILS_SERVER_PORT=18765 ./bin/kraa-e2e & KRAA=$!
sleep 2
curl -s 127.0.0.1:18765/health; echo
curl -s -X POST 127.0.0.1:18765/__e2e/trigger -d '{"selection":"oi"}' -o /dev/null -w '%{http_code}\n'
curl -s 127.0.0.1:18765/__e2e/state; echo
kill $KRAA $LLM
```
Expected: `{"status":"ok"}`, `204`, e um JSON com `"window":{"visible":true,"shows":1,...}`. Se `/__e2e/*` retornar a página do frontend em vez de 204/JSON, o Middleware não está na frente do handler — consultar via context7 "Wails v3 AssetOptions Middleware server mode" e ajustar; não seguir para a Task 9 sem este smoke passando.

- [ ] **Step 7: Commit**

```bash
git add internal/e2e main_server.go main.go
git commit -m "test(e2e): entrypoint server mode com fakes em memória e endpoints /__e2e"
```

---

### Task 9: Suíte Playwright (`e2e/`)

**Files:**
- Create: `e2e/package.json`, `e2e/package-lock.json` (via `npm install`), `e2e/tsconfig.json`, `e2e/playwright.config.ts`
- Create: `e2e/support/env.ts`, `e2e/support/api.ts`, `e2e/support/fixtures.ts`
- Create: `e2e/tests/improve.spec.ts`, `e2e/tests/replace-copy.spec.ts`, `e2e/tests/errors.spec.ts`, `e2e/tests/cancel.spec.ts`, `e2e/tests/model.spec.ts`, `e2e/tests/profile.spec.ts`, `e2e/tests/keyboard.spec.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `cmd/llmfake` e `/__control/*` (Task 1); `bin/kraa-e2e` e `/__e2e/*` (Task 8), com os payloads exatos listados nessas tasks.
- Produces: `npm --prefix e2e test` (usado pela Task 10).

- [ ] **Step 1: Projeto**

`e2e/package.json`:

```json
{
  "name": "kraa-e2e",
  "private": true,
  "type": "module",
  "scripts": {
    "build:server": "npm --prefix ../frontend run build && cd .. && go build -tags server -o bin/kraa-e2e .",
    "test": "playwright test"
  },
  "devDependencies": {
    "@playwright/test": "1.59.1",
    "@types/node": "^22.20.4",
    "typescript": "^5.2.2"
  }
}
```

`e2e/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["**/*.ts"]
}
```

```bash
cd e2e && npm install && npx playwright install chromium webkit
```

`.gitignore` (acrescentar): `e2e/node_modules/`, `e2e/test-results/`, `e2e/playwright-report/`, `frontend/coverage/`, `npm/coverage/`, `coverage.out`. (`bin/` já deve estar ignorado — conferir.)

- [ ] **Step 2: `e2e/support/env.ts`**

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const KRAA_PORT = 18765;
export const LLM_PORT = 18766;
export const KRAA_URL = `http://127.0.0.1:${KRAA_PORT}`;
export const LLM_URL = `http://127.0.0.1:${LLM_PORT}`;

// Where os.UserConfigDir() lands for HOME/XDG_CONFIG_HOME/APPDATA below.
function configDir(home: string): string {
  switch (process.platform) {
    case "darwin":
      return path.join(home, "Library", "Application Support", "kraa");
    case "win32":
      return path.join(home, "AppData", "Roaming", "kraa");
    default:
      return path.join(home, ".config", "kraa");
  }
}

export const CONFIG_YAML = `hotkey: "CmdOrCtrl+Shift+Y"
provider:
  base_url: "${LLM_URL}/v1"
  api_key: ""
  model: "fake-a"
  timeout_seconds: 10
profile:
  enabled: false
  text: "Perfil padrão do E2E"
`;

export function configPath(): string {
  return path.join(configDir(process.env.KRAA_E2E_HOME!), "config.yaml");
}

export function writeConfig(): void {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), CONFIG_YAML, { mode: 0o600 });
}

/**
 * Creates the isolated HOME once (the config file is re-evaluated in every
 * worker; workers inherit KRAA_E2E_HOME from the runner process) and
 * returns the env for the kraa-e2e webServer.
 */
export function prepareHome(): Record<string, string> {
  if (!process.env.KRAA_E2E_HOME) {
    process.env.KRAA_E2E_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "kraa-e2e-"));
    writeConfig();
  }
  const home = process.env.KRAA_E2E_HOME;
  return {
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    APPDATA: path.join(home, "AppData", "Roaming"),
    WAILS_SERVER_HOST: "127.0.0.1",
    WAILS_SERVER_PORT: String(KRAA_PORT),
  };
}
```

- [ ] **Step 3: `e2e/playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";
import { KRAA_URL, LLM_PORT, LLM_URL, prepareHome } from "./support/env";

const env = prepareHome();

// One real backend (and one config.yaml) shared by every test, so tests run
// serially and each starts from resetAll() (see support/fixtures.ts).
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: KRAA_URL, trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Closest thing to WKWebView/WebKitGTK the CI can run.
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: [
    {
      command: `go run ../cmd/llmfake -addr 127.0.0.1:${LLM_PORT}`,
      url: `${LLM_URL}/v1/models`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "../bin/kraa-e2e",
      url: `${KRAA_URL}/health`,
      env,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
```

Conferir via context7 ("Playwright webServer array env reuseExistingServer") se a forma de array e o `env` estão corretos na 1.59.

- [ ] **Step 4: `e2e/support/api.ts` e `fixtures.ts`**

```ts
// api.ts
import { expect, type APIRequestContext } from "@playwright/test";
import { KRAA_URL, LLM_URL, writeConfig } from "./env";

export interface LlmRequest {
  model: string;
  messages: { role: string; content: string }[];
  canceled: boolean;
}

export interface Scenario {
  chunks?: string[];
  chunkDelayMs?: number;
  status?: number;
  message?: string;
  hang?: boolean;
  modelsStatus?: number;
  modelsMessage?: string;
}

export interface E2EState {
  clipboard: string;
  hasClipboard: boolean;
  pasted: string[];
  window: { visible: boolean; shows: number; hides: number };
  profileWindow: { visible: boolean; shows: number; hides: number };
}

async function ok(res: Promise<{ ok(): boolean; status(): number }>) {
  const r = await res;
  expect(r.ok(), `status ${r.status()}`).toBeTruthy();
}

export async function resetAll(request: APIRequestContext) {
  writeConfig(); // desfaz modelo/perfil gravados por testes anteriores
  await ok(request.post(`${LLM_URL}/__control/reset`));
  await ok(request.post(`${KRAA_URL}/__e2e/reset`)); // também recarrega o config.yaml
}

export const setScenario = (request: APIRequestContext, s: Scenario) => ok(request.post(`${LLM_URL}/__control/scenario`, { data: s }));

export async function llmRequests(request: APIRequestContext): Promise<LlmRequest[]> {
  return (await request.get(`${LLM_URL}/__control/requests`)).json();
}

export const trigger = (request: APIRequestContext, selection?: string) =>
  ok(request.post(`${KRAA_URL}/__e2e/trigger`, { data: selection === undefined ? {} : { selection } }));

export const setSession = (request: APIRequestContext, canReplace: boolean, reason = "") =>
  ok(request.post(`${KRAA_URL}/__e2e/session`, { data: { canReplace, reason } }));

export const setClipboard = (request: APIRequestContext, text: string) =>
  ok(request.post(`${KRAA_URL}/__e2e/clipboard`, { data: { text } }));

export async function e2eState(request: APIRequestContext): Promise<E2EState> {
  return (await request.get(`${KRAA_URL}/__e2e/state`)).json();
}

export const allContent = (r: LlmRequest) => r.messages.map((m) => m.content).join("\n");
```

```ts
// fixtures.ts
import { test as base, expect, type Page } from "@playwright/test";
import { resetAll } from "./api";

/** Opens the modal and waits for the events WebSocket, so selection:new isn't missed. */
async function openModal(page: Page, path = "/") {
  const connected = page.waitForEvent("console", (m) => m.text().includes("Event WebSocket connected"));
  await page.goto(path);
  await connected;
}

export const test = base.extend<{ openModal: (path?: string) => Promise<void> }>({
  openModal: async ({ page, request }, use) => {
    await resetAll(request);
    await use((path) => openModal(page, path));
  },
});

export { expect };
```

- [ ] **Step 5: `tests/improve.spec.ts` (primeiro fluxo — ver falhar antes de passar)**

```ts
import { allContent, llmRequests, trigger } from "../support/api";
import { expect, test } from "../support/fixtures";

const RESULT = "Texto melhorado pelo fake.";

test("seleção capturada → ação → stream no preview", async ({ page, request, openModal }) => {
  await openModal();
  await trigger(request, "texto original do usuário");
  await expect(page.getByRole("textbox", { name: "Texto a melhorar" })).toHaveValue("texto original do usuário");

  await page.getByRole("option", { name: "Melhorar prompt" }).click();
  await expect(page.getByText(RESULT)).toBeVisible();
  await expect(page.getByRole("button", { name: /Substituir/ })).toBeFocused();

  const [req] = await llmRequests(request);
  expect(req.model).toBe("fake-a");
  expect(allContent(req)).toContain("texto original do usuário");
});

test("sem seleção: modal vazio e editável usa o texto digitado", async ({ page, request, openModal }) => {
  await openModal();
  await trigger(request);
  const box = page.getByRole("textbox", { name: "Texto a melhorar" });
  await expect(box).toHaveValue("");
  await box.fill("digitado à mão");
  await page.getByRole("option", { name: "Melhorar prompt" }).click();
  await expect(page.getByText(RESULT)).toBeVisible();
  expect(allContent((await llmRequests(request))[0])).toContain("digitado à mão");
});

test("instrução livre na busca", async ({ page, request, openModal }) => {
  await openModal();
  await trigger(request, "abc");
  await page.getByRole("combobox", { name: "Buscar ação" }).fill("traduza para inglês");
  await page.keyboard.press("Enter");
  await expect(page.getByText(RESULT)).toBeVisible();
  expect(allContent((await llmRequests(request))[0])).toContain("traduza para inglês");
});
```

Run: `npm --prefix e2e run build:server && npm --prefix e2e test -- --project=chromium improve`
Se o Enter na busca não disparar a instrução livre (depende de como a busca filtra), usar o fluxo exato do checklist manual do `CLAUDE.md` ("digitar, ↑/↓, Enter") e ajustar só o seletor. Expected final: PASS.

- [ ] **Step 6: `tests/replace-copy.spec.ts`**

```ts
import { e2eState, setClipboard, setSession, trigger } from "../support/api";
import { expect, test } from "../support/fixtures";

const RESULT = "Texto melhorado pelo fake.";

async function improve(page, request, selection = "abc") {
  await trigger(request, selection);
  await page.getByRole("option", { name: "Melhorar prompt" }).click();
  await expect(page.getByText(RESULT)).toBeVisible();
}

test("Enter em Substituir cola o resultado e restaura o clipboard", async ({ page, request, openModal }) => {
  await openModal();
  await setClipboard(request, "clipboard do usuário");
  await improve(page, request);
  await page.keyboard.press("Enter"); // foco já está em Substituir

  await expect.poll(async () => (await e2eState(request)).pasted).toEqual([RESULT]);
  const st = await e2eState(request);
  expect(st.clipboard).toBe("clipboard do usuário");
  expect(st.window.hides).toBeGreaterThanOrEqual(1);
});

test("Copiar põe o resultado no clipboard sem erro", async ({ page, request, openModal }) => {
  await openModal();
  await improve(page, request);
  await page.getByRole("button", { name: /Copiar/ }).click();
  await expect.poll(async () => (await e2eState(request)).clipboard).toBe(RESULT);
  await expect(page.getByText("Não foi possível concluir a ação")).toHaveCount(0);
});

test("sem permissão de colar: Substituir some e o aviso aparece", async ({ page, request, openModal }) => {
  await openModal();
  await setSession(request, false, "Sem permissão de Acessibilidade.");
  await improve(page, request);
  await expect(page.getByRole("button", { name: /Substituir/ })).toHaveCount(0);
  await expect(page.getByText("Sem permissão de Acessibilidade.")).toBeVisible();
  await page.getByRole("button", { name: /Copiar/ }).click();
  await expect.poll(async () => (await e2eState(request)).clipboard).toBe(RESULT);
});
```

(Tipar `page`/`request` em `improve` com `Page`/`APIRequestContext` de `@playwright/test`.)

- [ ] **Step 7: `tests/errors.spec.ts` e `tests/cancel.spec.ts`**

```ts
// errors.spec.ts
import { setScenario, trigger } from "../support/api";
import { expect, test } from "../support/fixtures";

for (const [status, suffix] of [[401, "verifique a api_key"], [404, "verifique o model"]] as const) {
  test(`HTTP ${status} vira mensagem PT-BR`, async ({ page, request, openModal }) => {
    await openModal();
    await setScenario(request, { status, message: "falha do provider" });
    await trigger(request, "abc");
    await page.getByRole("option", { name: "Melhorar prompt" }).click();
    await expect(page.getByText(`falha do provider — ${suffix}`)).toBeVisible();
  });
}

test("erro ao listar modelos mostra só o modelo atual e a mensagem", async ({ page, request, openModal }) => {
  await setScenario(request, { modelsStatus: 500, modelsMessage: "sem modelos" });
  await openModal();
  const picker = page.getByRole("combobox", { name: "Modelo" });
  await expect(picker.locator("option")).toHaveText(["fake-a"]);
  await expect(page.getByRole("status")).toContainText("Não foi possível listar os modelos: sem modelos");
});
```

Atenção à ordem no último teste: `setScenario` precisa vir **depois** do reset (feito dentro de `openModal`) e **antes** do `page.goto`. Separar o reset do goto na fixture se necessário: expor `resetAll` e chamar `page.goto` manualmente neste teste.

```ts
// cancel.spec.ts
import { e2eState, llmRequests, setScenario, trigger } from "../support/api";
import { expect, test } from "../support/fixtures";

test("Fechar no meio do stream cancela o pedido sem erro", async ({ page, request, openModal }) => {
  await openModal();
  await setScenario(request, { chunks: ["parcial "], hang: true });
  await trigger(request, "abc");
  await page.getByRole("option", { name: "Melhorar prompt" }).click();
  await expect(page.getByText("parcial")).toBeVisible();

  await page.getByRole("button", { name: "Fechar" }).click();

  await expect.poll(async () => (await llmRequests(request))[0]?.canceled).toBe(true);
  expect((await e2eState(request)).window.hides).toBeGreaterThanOrEqual(1);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
```

- [ ] **Step 8: `tests/model.spec.ts` e `tests/profile.spec.ts`**

```ts
// model.spec.ts
import fs from "node:fs";
import { llmRequests, trigger } from "../support/api";
import { configPath } from "../support/env";
import { expect, test } from "../support/fixtures";

test("trocar o modelo grava provider.model e vale para a próxima melhoria", async ({ page, request, openModal }) => {
  await openModal();
  const picker = page.getByRole("combobox", { name: "Modelo" });
  await expect(picker.locator("option")).toHaveText(["fake-a", "fake-b"]);
  await picker.selectOption("fake-b");

  await expect.poll(() => fs.readFileSync(configPath(), "utf8")).toContain('model: "fake-b"');
  const yaml = fs.readFileSync(configPath(), "utf8");
  expect(yaml).toContain('base_url: "http://127.0.0.1:18766/v1"'); // resto intacto
  await expect(page.getByText(/Não foi possível registrar o atalho/)).toHaveCount(0);

  await trigger(request, "abc");
  await page.getByRole("option", { name: "Melhorar prompt" }).click();
  await expect(page.getByText("Texto melhorado pelo fake.")).toBeVisible();
  expect((await llmRequests(request)).at(-1)!.model).toBe("fake-b");
});
```

```ts
// profile.spec.ts
import fs from "node:fs";
import { allContent, llmRequests, trigger } from "../support/api";
import { configPath } from "../support/env";
import { expect, test } from "../support/fixtures";

test("salvar perfil ativo grava o config e só ações de prompt o recebem", async ({ page, request, openModal }) => {
  await openModal("/?view=profile");
  const about = page.getByRole("textbox", { name: "Sobre você" });
  await about.fill("Sou tester E2E do Kraa");
  await page.getByRole("checkbox", { name: "Usar perfil" }).check();
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect.poll(() => fs.readFileSync(configPath(), "utf8")).toContain("Sou tester E2E do Kraa");

  await openModal("/");
  await trigger(request, "abc");
  await page.getByRole("option", { name: "Melhorar prompt" }).click();
  await expect(page.getByText("Texto melhorado pelo fake.")).toBeVisible();

  await trigger(request, "abc"); // janela visível: só refoca; o texto continua "abc"
  await page.getByRole("option", { name: "Mais formal" }).click();
  await expect.poll(async () => (await llmRequests(request)).length).toBe(2);

  const [withProfile, formal] = await llmRequests(request);
  expect(allContent(withProfile)).toContain("Sou tester E2E do Kraa");
  expect(allContent(formal)).not.toContain("Sou tester E2E do Kraa");
});

test("ativar perfil vazio mostra o erro e mantém a janela", async ({ page, openModal }) => {
  await openModal("/?view=profile");
  await page.getByRole("textbox", { name: "Sobre você" }).fill("");
  await page.getByRole("checkbox", { name: "Usar perfil" }).check();
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Escreva o perfil antes de ativá-lo.")).toBeVisible();
});
```

Se o `openModal("/")` depois do perfil perder o estado de reset (é uma nova chamada da fixture, não reseta de novo — a fixture só reseta uma vez no início do teste), está correto. Se "Mais formal" com o resultado anterior na tela exigir voltar às ações primeiro (↑), usar `page.keyboard.press("ArrowUp")` antes do clique.

- [ ] **Step 9: `tests/keyboard.spec.ts`**

```ts
import { trigger } from "../support/api";
import { expect, test } from "../support/fixtures";

test("fluxo só de teclado: ↓/Enter, foco em Substituir, ←/→, ↑ volta às ações", async ({ page, request, openModal }) => {
  await openModal();
  await trigger(request, "abc");
  const search = page.getByRole("combobox", { name: "Buscar ação" });
  await expect(search).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Texto melhorado pelo fake.")).toBeVisible();

  const replace = page.getByRole("button", { name: /Substituir/ });
  const copy = page.getByRole("button", { name: /Copiar/ });
  await expect(replace).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(copy).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(replace).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(search).toBeFocused();
});
```

(A ordem exata ←/→ entre Copiar e Substituir vem do `Footer.tsx`; se Copiar estiver à direita, inverter as setas.)

- [ ] **Step 10: Rodar a suíte nos dois navegadores, 3 vezes**

```bash
npm --prefix e2e run build:server
npm --prefix e2e test -- --repeat-each=3
```
Expected: todos PASS em chromium e webkit, sem retry. Teste instável → corrigir a espera (usar `expect.poll`/`toBeVisible`, nunca `waitForTimeout`).

- [ ] **Step 11: Commit**

```bash
git add e2e .gitignore
git commit -m "test(e2e): suíte Playwright contra o backend real em server mode"
```

---

### Task 10: CI (gates + job E2E) e documentação, incluindo o que não é testável

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `site/src/content/docs/contribuir/testes.mdx`
- Modify: `CLAUDE.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `BACKLOG.md`

**Interfaces:**
- Consumes: scripts `typecheck`, `lint`, `coverage` (frontend, Task 4/5), `coverage` (npm, Task 6), `bin/kraa-e2e` + `e2e/` (Tasks 8/9).

- [ ] **Step 1: `ci.yml` — lint**

No job `lint`, depois de `go vet`:

```yaml
      - name: go vet (server mode, E2E)
        run: go vet -tags server ./...
```

- [ ] **Step 2: `ci.yml` — gate de cobertura Go (macOS)**

Trocar o passo "Testes Go (com -race, macOS)" por:

```yaml
      # Gate de cobertura do backend (só no macOS: arquivos por SO mudam o
      # total entre plataformas). Mínimo em sincronia com a doc de testes.
      - name: Testes Go (com -race e cobertura, macOS)
        if: runner.os == 'macOS'
        run: |
          go test ./... -race -coverprofile=coverage.out
          total=$(go tool cover -func=coverage.out | awk '/^total:/ {sub("%","",$3); print $3}')
          echo "Cobertura Go: ${total}%"
          awk -v t="$total" -v min=87 'BEGIN { if (t+0 < min) { print "Cobertura abaixo de " min "%"; exit 1 } }'
```

Observação: o total aqui inclui `main.go`/adapters Wails a 0%; se o valor ficar abaixo de 87 **só** por isso, usar `go test ./internal/... -race -coverprofile=coverage.out` seguido de `go test . -race` (mantendo `.` testado), e registrar no comentário do passo.

- [ ] **Step 3: `ci.yml` — frontend**

Trocar "Testes do frontend" por:

```yaml
      - name: Typecheck do frontend
        run: npm run typecheck
        working-directory: frontend

      - name: Lint do frontend
        if: runner.os == 'Linux'
        run: npm run lint
        working-directory: frontend

      - name: Testes do frontend (com cobertura)
        run: npm run coverage
        working-directory: frontend
```

- [ ] **Step 4: `ci.yml` — npm**

No job `npm`, trocar `run: npm test` por `run: npm run coverage` (nome do passo: "Testes (com cobertura)").

- [ ] **Step 5: `ci.yml` — job E2E**

```yaml
  e2e:
    name: E2E (Playwright, server mode)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-go@v5
        with:
          go-version-file: go.mod
          cache: true

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
          cache-dependency-path: |
            frontend/package-lock.json
            e2e/package-lock.json

      - name: Instala dependências do frontend
        run: npm ci
        working-directory: frontend

      # O //go:embed all:frontend/dist precisa do bundle real antes do build.
      - name: Build do frontend
        run: npm run build
        working-directory: frontend

      # -tags server exclui todos os arquivos GTK/WebKit do Wails: não precisa
      # de cgo nem de Xvfb (verificado com GOOS=linux CGO_ENABLED=0).
      - name: Build do binário E2E (server mode)
        run: CGO_ENABLED=0 go build -tags server -o bin/kraa-e2e .

      - name: Instala dependências do E2E
        run: npm ci
        working-directory: e2e

      - name: Instala navegadores do Playwright
        run: npx playwright install --with-deps chromium webkit
        working-directory: e2e

      - name: Playwright
        run: npx playwright test
        working-directory: e2e

      - name: Publica relatório do Playwright
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: e2e/playwright-report/
          retention-days: 7
```

Validar a sintaxe: `npx --yes @action-validator/cli .github/workflows/ci.yml` (ou `actionlint` se instalado). Abrir o PR e acompanhar o primeiro run do job `e2e` com `gh run watch`; **o binário server nunca rodou no Linux antes** — se falhar lá, investigar com `superpowers:systematic-debugging` a partir do log do `webServer`.

- [ ] **Step 6: Documentação — `site/src/content/docs/contribuir/testes.mdx`**

Substituir a seção "Automatizados" e a tabela de CI, e adicionar as seções abaixo antes de "Checklist manual" (o checklist continua e passa a ser a cobertura oficial do que o E2E não alcança):

````mdx
## Automatizados

```bash
go test ./...                      # backend (Linux: go test -tags gtk3 ./...)
npm --prefix frontend test         # modal (Vitest + Testing Library)
npm --prefix frontend run coverage # idem, com gate de cobertura
npm --prefix frontend run typecheck && npm --prefix frontend run lint
npm --prefix npm run coverage      # instalador e CLI (Vitest)
npm --prefix e2e run build:server  # binário server mode + frontend
npm --prefix e2e test              # E2E (Playwright, Chromium e WebKit)
```

### Camadas

| Camada | Onde | O que cobre |
|---|---|---|
| Unitários Go | `internal/**/_test.go` | Config, cliente SSE, improver, captura/colagem com fakes, reload e troca de atalho (`internal/app/reloader.go`), fila de segunda instância (`launch.go`). |
| Integração Go | `internal/app/integration_test.go` | `ImproveService` → improver → cliente HTTP real → `internal/llmfake`. |
| Unitários frontend | `frontend/src/**/*.test.tsx` | Componentes e `useImprove`, com o runtime do Wails e os bindings trocados por mocks tipados (`src/test/`). |
| CLI npm | `npm/test` | Instalador, `doctor`, `autostart`, subcomandos. |
| E2E | `e2e/` | Frontend real no navegador falando com o backend Go real em *server mode* do Wails (`main_server.go`, `-tags server`) e com um LLM fake (`cmd/llmfake`). |

### Como o E2E funciona

`main_server.go` sobe o mesmo `ImproveService` servindo o frontend por HTTP. Tudo que depende do
desktop é trocado por fakes em memória (`internal/e2e`) controlados por endpoints `/__e2e/*`:
`trigger` simula a seleção capturada, `state` mostra o que foi colado, o clipboard e a
visibilidade das janelas, `session` liga/desliga a colagem automática, `reset` limpa tudo e relê o
`config.yaml`. O LLM fake é scriptado por `/__control/*`. Esse binário **nunca** é distribuído.

## CI

| Job | O que verifica |
|---|---|
| Lint | `gofmt`, `go vet -tags gtk3` e `go vet -tags server` |
| Build e testes | `go test -race` com cobertura mínima de **87%** (macOS), typecheck, ESLint e Vitest com thresholds do frontend, `wails3 build` em macOS, Windows e Ubuntu |
| Wrapper npm | testes com thresholds de cobertura, typecheck e build |
| E2E | Playwright (Chromium e WebKit) contra o binário server mode no Ubuntu |

Os thresholds do frontend e do npm ficam nos `vitest.config.ts` de cada pacote. Só suba esses
números; nunca baixe para fazer a CI passar.

## O que não tem teste automatizado

Estes comportamentos dependem do sistema operacional real e **não são alcançados** nem pelos
unitários nem pelo E2E. Eles ficam no checklist manual abaixo:

| Comportamento | Por que não é automatizado |
|---|---|
| Captura real da seleção (`⌘C`/`Ctrl+C` simulado noutro app) e colagem real no app de origem | Exige outro app com foco e teclas do SO. `keys_darwin.go` usa CGEvent (cgo) e Acessibilidade; no Linux, `xdotool` num X11 real. O E2E simula a captura com `/__e2e/trigger`, e os unitários cobrem `Capture`/`Paste` com fakes. |
| Atalho global (`⌘⇧Y`) e registro pelo SO | No server mode o Wails não tem atalhos globais. A lógica de troca e rollback é coberta em `reloader_test.go` com um fake, mas a rejeição real pelo SO não é. |
| Bandeja (menu, "Iniciar com o sistema", "Editar configuração") | Não existe bandeja no server mode nem no CI. Os artefatos de autostart são testados em `internal/autostart`. |
| Single-instance e `kraa --trigger` numa segunda instância | Precisa de dois processos desktop. A fila é testada em `launch_test.go`. |
| Janela nativa: `Esc`, `⌘W`, foco devolvido ao app de origem (`ReleaseFocus`), `AlwaysOnTop`, `HiddenOnTaskbar` | São key bindings e hooks da janela nativa, que não existem no navegador. O E2E só vê a contagem de show/hide nos fakes. |
| `ApplicationStarted` (aviso de atalho e janela no boot) | O Wails não emite esse evento em server mode. A decisão (`Drain`) é testada em `launch_test.go`. |
| Renderização no WebView de produção (WKWebView, WebView2, WebKitGTK) | O E2E usa Chromium e o WebKit do Playwright, que é o mais próximo, mas não idêntico. |
| Permissão de Acessibilidade do macOS e Wayland | Dependem do SO. O E2E cobre o *efeito* (sem "Substituir", com aviso) via `/__e2e/session`. |
| "Ollama parado" no fluxo do E2E | O fake não simula conexão recusada. Coberto em `integration_test.go` (servidor fechado) e no checklist. |
````

No checklist manual do mesmo arquivo, acrescentar em **Todos**:

```mdx
- [ ] Bandeja → "Recarregar configuração" com um `hotkey` inválido: aviso "Mantido …" e o atalho anterior continua funcionando.
- [ ] Segunda instância com `kraa --trigger` logo após abrir o app: o modal abre com a seleção.
```

- [ ] **Step 7: `CLAUDE.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `BACKLOG.md`**

`CLAUDE.md`:
- Mapa de pacotes: adicionar linhas para `internal/llmfake` ("LLM OpenAI-compatível fake para testes; `cmd/llmfake` o expõe ao E2E. Não importa o Wails."), `internal/e2e` ("Fakes em memória e endpoints `/__e2e/*` do build server mode. Não importa o Wails.") e `e2e/` ("Suíte Playwright contra `main_server.go`"). Na linha de `main.go`, mencionar `main_server.go` (`-tags server`, só E2E) e que a lógica fica em `internal/app` (`reloader.go`, `launch.go`, `bootstrap.go`).
- Comandos: adicionar `npm --prefix frontend run coverage|typecheck|lint`, `npm --prefix npm run coverage`, `npm --prefix e2e run build:server` e `npm --prefix e2e test`.
- Regras: trocar "Só `main.go` e `internal/app` podem depender de `github.com/wailsapp/wails/v3`" por "Só `main.go`, `main_server.go` e `internal/app` podem…"; adicionar "O build `-tags server` e `/__e2e/*` nunca entram em release."

`CONTRIBUTING.md`: no bloco de comandos (linhas ~78-80), adicionar os mesmos comandos de coverage/typecheck/lint/E2E.

`CHANGELOG.md`, em `## [Não lançado]`, acrescentar:

```md
### Adicionado

- Suíte E2E com Playwright contra o backend real (modo servidor do Wails) e um LLM fake.
- Gate de cobertura na CI para backend, frontend e CLI npm, além de typecheck e ESLint no frontend.
```

(Se `### Adicionado` já existir em "Não lançado", acrescentar os itens nela.)

`BACKLOG.md`: marcar `- [x] Ajustar camada de testes (unitários e e2e)`.

- [ ] **Step 8: Verificar o site e tudo localmente**

```bash
npm --prefix site run check && npm --prefix site run build
gofmt -l . && go vet ./... && go vet -tags server ./... && go test -race ./...
npm --prefix frontend run typecheck && npm --prefix frontend run lint && npm --prefix frontend run coverage
npm --prefix npm run typecheck && npm --prefix npm run coverage
npm --prefix e2e run build:server && npm --prefix e2e test
```
Expected: tudo verde (skill `superpowers:verification-before-completion` antes de declarar concluído).

- [ ] **Step 9: Commit**

```bash
git add .github/workflows/ci.yml site/src/content/docs/contribuir/testes.mdx CLAUDE.md CONTRIBUTING.md CHANGELOG.md BACKLOG.md
git commit -m "ci: gates de cobertura, lint e job E2E; docs de testes e limitações"
```

---

## Revisão final

Depois da Task 10: `code-review` na branch inteira e o agente `cross-platform-reviewer` sobre `main.go`, `main_server.go`, `internal/platform/keys_linux.go` e `internal/autostart/autostart.go` (tocados por build tag/SO).
