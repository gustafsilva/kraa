# Seletor de modelo no modal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Ao sair do plan mode, copiar este arquivo para `docs/superpowers/plans/2026-09-26-model-picker.md` e commitar junto com a Task 1.

**Goal:** Permitir escolher, no header do modal, o modelo LLM a partir da lista de modelos instalados no Ollama local (ou disponíveis no provider), gravando a escolha em `provider.model` no `config.yaml`.

**Architecture:** `internal/llm` ganha `ListModels` (`GET {base_url}/models`, formato OpenAI — o Ollama devolve os modelos instalados). `internal/config` ganha `SaveModel`, que edita só a linha `model:` do arquivo (comentários/layout intactos). `internal/app` expõe os bindings `ListModels`/`SetModel` e `State.model`; `SetModel` chama um `ModelSaver` injetado por `main.go` via `Host.SetModelSaver`, que grava o arquivo e dispara o `reload()` existente (novo runner + `state:changed`). O frontend mostra um `NativeSelect` (shadcn) no header.

**Tech Stack:** Go 1.25, `gopkg.in/yaml.v3` (`yaml.Node` só para localizar linhas), Wails v3 beta.26, React + TS, shadcn `native-select`, Vitest + Testing Library.

**Spec:** design aprovado no chat (sessão de 2026-09-26): lista via `/models`, persistência em `config.yaml`, seletor no header, fallback quando o modelo atual não está na lista, erro inline se a listagem falhar, seletor desabilitado durante o stream.

## Global Constraints

- `internal/config`, `internal/llm`, `internal/improver` **não importam Wails**; só `main.go` e `internal/app`.
- Textos de UI/erros ao usuário em **PT-BR**; identificadores em inglês.
- TDD em todos os pacotes: teste → falha → implementação → passa.
- Sem `if runtime.GOOS` em código de produção.
- `go test ./...` e `npm --prefix frontend test` passam antes de cada commit (no Linux: `go test -tags gtk3 ./...`).
- Commits no estilo do repo (`feat(llm): ...`), terminando com `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **Modelo configurado fora da lista** (`llama3.2` vs `llama3.2:latest` do Ollama): o seletor continua mostrando/selecionando o modelo atual, sem trocar sozinho. → teste no Task 5.
2. **Ollama parado ao abrir o modal**: o modal funciona, o seletor mostra só o modelo atual e o erro com a dica `ollama serve`. → testes nos Tasks 3 e 5.
3. **`config.yaml` editado à mão (comentários, ações próprias, CRLF no Windows)**: só a linha do `model` muda; o resto fica byte a byte igual. → testes no Task 2.
4. **Troca durante o stream**: seletor desabilitado; o request em andamento segue com o runner antigo (o `run` já captura o runner). → teste no Task 5.
5. **YAML inválido no disco ao salvar**: `SetModel` devolve erro PT-BR e o arquivo não é alterado. → teste no Task 2.

## Arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `internal/llm/models.go` / `models_test.go` | Criar | `ListModels` |
| `internal/config/save.go` / `save_test.go` | Criar | `SaveModel` (edição cirúrgica da linha) |
| `internal/config/defaults.go` | Modificar | comentário do `model` citando o seletor |
| `internal/app/service.go` / `service_test.go` | Modificar | `State.Model`, `ListModels`, `SetModel`, `ModelSaver`, `Host.SetModelSaver` |
| `main.go` | Modificar | injeta o saver (grava + `reload()`) |
| `frontend/bindings/...` | Regenerar | `wails3 generate bindings -ts` |
| `frontend/src/components/ui/native-select.tsx` | Criar (shadcn CLI) | componente base |
| `frontend/src/components/ModelPicker.tsx` | Criar | seletor + erro inline |
| `frontend/src/hooks/useImprove.ts` | Modificar | `model`, `models`, `modelsError`, `modelSaving`, `setModel`, `loadModels` |
| `frontend/src/App.tsx` / `App.test.tsx` / `test/improveServiceMock.ts` | Modificar | header + testes |
| `CLAUDE.md` | Modificar | item no checklist manual |

---

### Task 1: `llm.ListModels`

**Files:**
- Create: `internal/llm/models.go`, `internal/llm/models_test.go`

**Interfaces:**
- Consumes: `isUnreachableErr`, `newAPIErrorFromResponse`, `ErrUnreachable`, `APIError` (já em `internal/llm/client.go`).
- Produces: `func ListModels(ctx context.Context, baseURL, apiKey string) ([]string, error)` — ids ordenados, sem duplicatas nem vazios.

- [ ] **Step 1: Write the failing tests** (`internal/llm/models_test.go`)

```go
package llm

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
)

func TestListModels_ReturnsSortedUniqueIDs(t *testing.T) {
	var gotPath, gotAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath, gotAuth = r.URL.Path, r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"object":"list","data":[
			{"id":"llama3.2:latest"},{"id":"gpt-oss:120b-cloud"},{"id":""},{"id":"llama3.2:latest"}]}`))
	}))
	defer server.Close()

	got, err := ListModels(context.Background(), server.URL+"/v1/", "sk-x")
	if err != nil {
		t.Fatalf("ListModels() error = %v", err)
	}
	want := []string{"gpt-oss:120b-cloud", "llama3.2:latest"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
	if gotPath != "/v1/models" {
		t.Errorf("path = %q, want /v1/models", gotPath)
	}
	if gotAuth != "Bearer sk-x" {
		t.Errorf("Authorization = %q", gotAuth)
	}
}

func TestListModels_NoAuthHeaderWithoutAPIKey(t *testing.T) {
	var gotAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		_, _ = w.Write([]byte(`{"data":[]}`))
	}))
	defer server.Close()

	got, err := ListModels(context.Background(), server.URL, "")
	if err != nil {
		t.Fatalf("ListModels() error = %v", err)
	}
	if len(got) != 0 || gotAuth != "" {
		t.Errorf("got %v, auth %q", got, gotAuth)
	}
}

func TestListModels_HTTPErrorReturnsAPIError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":{"message":"invalid api key"}}`))
	}))
	defer server.Close()

	_, err := ListModels(context.Background(), server.URL, "bad")
	var apiErr *APIError
	if !errors.As(err, &apiErr) || apiErr.Status != 401 || apiErr.Message != "invalid api key" {
		t.Fatalf("err = %v, want *APIError 401 'invalid api key'", err)
	}
}

func TestListModels_UnreachableServer(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	url := server.URL
	server.Close()

	_, err := ListModels(context.Background(), url, "")
	if !errors.Is(err, ErrUnreachable) {
		t.Fatalf("err = %v, want ErrUnreachable", err)
	}
}

func TestListModels_InvalidJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`<html>not json</html>`))
	}))
	defer server.Close()

	if _, err := ListModels(context.Background(), server.URL, ""); err == nil {
		t.Fatal("ListModels() error = nil, want parse error")
	}
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `go test ./internal/llm/ -run TestListModels -v`
Expected: FAIL — `undefined: ListModels`.

- [ ] **Step 3: Implement** (`internal/llm/models.go`)

```go
package llm

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
)

// maxModelsBodyBytes limita o corpo lido de GET /models.
const maxModelsBodyBytes = 1024 * 1024

type modelsResponse struct {
	Data []struct {
		ID string `json:"id"`
	} `json:"data"`
}

// ListModels consulta GET {baseURL}/models (formato OpenAI; no Ollama lista
// os modelos instalados) e devolve os ids em ordem alfabética, sem repetição.
// Os erros seguem os de Stream: ErrUnreachable (via errors.Is) e *APIError.
func ListModels(ctx context.Context, baseURL, apiKey string) ([]string, error) {
	baseURL = strings.TrimRight(baseURL, "/")
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/models", nil)
	if err != nil {
		return nil, fmt.Errorf("montar requisição: %w", err)
	}
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return nil, ctxErr
		}
		if isUnreachableErr(err) {
			return nil, fmt.Errorf("não foi possível conectar em %s: %w", baseURL, ErrUnreachable)
		}
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, newAPIErrorFromResponse(resp)
	}

	var body modelsResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxModelsBodyBytes)).Decode(&body); err != nil {
		return nil, fmt.Errorf("resposta inválida de %s/models: %w", baseURL, err)
	}

	seen := make(map[string]struct{}, len(body.Data))
	ids := make([]string, 0, len(body.Data))
	for _, m := range body.Data {
		if m.ID == "" {
			continue
		}
		if _, dup := seen[m.ID]; dup {
			continue
		}
		seen[m.ID] = struct{}{}
		ids = append(ids, m.ID)
	}
	sort.Strings(ids)
	return ids, nil
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `go test ./internal/llm/ -v -run TestListModels && go vet ./internal/llm/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/llm/models.go internal/llm/models_test.go docs/superpowers/plans/2026-09-26-model-picker.md
git commit -m "feat(llm): ListModels consulta GET /models do provider"
```

---

### Task 2: `config.SaveModel`

**Files:**
- Create: `internal/config/save.go`, `internal/config/save_test.go`
- Modify: `internal/config/defaults.go` (comentário do bloco `provider`)

**Interfaces:**
- Consumes: `Load`, `defaultConfigYAML` (mesmo pacote).
- Produces: `func SaveModel(path, model string) error` — grava `provider.model`, preservando o restante do arquivo e as permissões.

**Abordagem:** o `yaml.Node` é usado só para *achar* as linhas (`Line`/`Column`); a escrita troca apenas a linha do `model:` no texto original. Re-serializar com yaml.v3 perderia linhas em branco e mudaria a formatação. O valor é escrito como string JSON, que é um escalar YAML válido entre aspas duplas. O `\r` final (CRLF) é mantido. A escrita é atômica (arquivo temporário + `os.Rename`) com as permissões originais.

- [ ] **Step 1: Write the failing tests** (`internal/config/save_test.go`)

```go
package config

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func writeTemp(t *testing.T, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func readFile(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestSaveModel_ChangesOnlyModelLineOfDefaultTemplate(t *testing.T) {
	path := writeTemp(t, defaultConfigYAML)

	if err := SaveModel(path, "llama3.1:8b"); err != nil {
		t.Fatalf("SaveModel() error = %v", err)
	}

	before := strings.Split(defaultConfigYAML, "\n")
	after := strings.Split(readFile(t, path), "\n")
	if len(before) != len(after) {
		t.Fatalf("line count %d -> %d", len(before), len(after))
	}
	var diffs []string
	for i := range before {
		if before[i] != after[i] {
			diffs = append(diffs, after[i])
		}
	}
	if len(diffs) != 1 || diffs[0] != `  model: "llama3.1:8b"` {
		t.Fatalf("diffs = %q, want only the model line", diffs)
	}

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.Provider.Model != "llama3.1:8b" {
		t.Errorf("Model = %q", cfg.Provider.Model)
	}
}

func TestSaveModel_KeepsInlineComment(t *testing.T) {
	path := writeTemp(t, "provider:\n  base_url: \"http://x/v1\"\n  model: llama3 # meu modelo\n")

	if err := SaveModel(path, "qwen3"); err != nil {
		t.Fatal(err)
	}
	want := "provider:\n  base_url: \"http://x/v1\"\n  model: \"qwen3\" # meu modelo\n"
	if got := readFile(t, path); got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestSaveModel_PreservesCRLF(t *testing.T) {
	path := writeTemp(t, "provider:\r\n  base_url: \"http://x/v1\"\r\n  model: \"a\"\r\n")

	if err := SaveModel(path, "b"); err != nil {
		t.Fatal(err)
	}
	want := "provider:\r\n  base_url: \"http://x/v1\"\r\n  model: \"b\"\r\n"
	if got := readFile(t, path); got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestSaveModel_InsertsMissingModelKey(t *testing.T) {
	path := writeTemp(t, "# topo\nprovider:\n    base_url: \"http://x/v1\"\nhotkey: \"CmdOrCtrl+Shift+Y\"\n")

	if err := SaveModel(path, "qwen3"); err != nil {
		t.Fatal(err)
	}
	want := "# topo\nprovider:\n    model: \"qwen3\"\n    base_url: \"http://x/v1\"\nhotkey: \"CmdOrCtrl+Shift+Y\"\n"
	if got := readFile(t, path); got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestSaveModel_AppendsMissingProvider(t *testing.T) {
	path := writeTemp(t, "hotkey: \"CmdOrCtrl+Shift+Y\"")

	if err := SaveModel(path, "qwen3"); err != nil {
		t.Fatal(err)
	}
	want := "hotkey: \"CmdOrCtrl+Shift+Y\"\nprovider:\n  model: \"qwen3\"\n"
	if got := readFile(t, path); got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestSaveModel_QuotesSpecialCharacters(t *testing.T) {
	path := writeTemp(t, defaultConfigYAML)
	model := `hf.co/bartowski/Llama-3.2:Q4_K_M #"x"`

	if err := SaveModel(path, model); err != nil {
		t.Fatal(err)
	}
	cfg, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Provider.Model != model {
		t.Errorf("Model = %q, want %q", cfg.Provider.Model, model)
	}
}

func TestSaveModel_InvalidYAMLLeavesFileUntouched(t *testing.T) {
	content := "provider: [unclosed\n"
	path := writeTemp(t, content)

	if err := SaveModel(path, "qwen3"); err == nil {
		t.Fatal("SaveModel() error = nil, want YAML error")
	}
	if got := readFile(t, path); got != content {
		t.Errorf("file changed: %q", got)
	}
}

func TestSaveModel_RejectsEmptyModel(t *testing.T) {
	path := writeTemp(t, defaultConfigYAML)
	if err := SaveModel(path, "   "); err == nil {
		t.Fatal("SaveModel() error = nil, want error")
	}
	if readFile(t, path) != defaultConfigYAML {
		t.Error("file changed")
	}
}

func TestSaveModel_KeepsPermissions(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("permissões POSIX")
	}
	path := writeTemp(t, defaultConfigYAML)
	if err := SaveModel(path, "qwen3"); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Errorf("perm = %o, want 600", info.Mode().Perm())
	}
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `go test ./internal/config/ -run TestSaveModel -v`
Expected: FAIL — `undefined: SaveModel`.

- [ ] **Step 3: Implement** (`internal/config/save.go`)

```go
package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// SaveModel grava model em provider.model no arquivo em path, alterando só
// essa linha: comentários, ordem, linhas em branco e finais de linha (LF ou
// CRLF) do restante do arquivo ficam intactos. Se provider.model (ou o
// próprio provider) não existir, a chave é criada. A escrita é atômica e
// mantém as permissões do arquivo.
func SaveModel(path, model string) error {
	model = strings.TrimSpace(model)
	if model == "" {
		return fmt.Errorf("config: model não pode ser vazio")
	}

	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("config: não foi possível ler %s: %w", path, err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("config: não foi possível ler %s: %w", path, err)
	}

	updated, err := setProviderModel(string(data), model)
	if err != nil {
		return fmt.Errorf("config: %s: %w", path, err)
	}
	return writeFileAtomic(path, []byte(updated), info.Mode().Perm())
}

// setProviderModel devolve content com provider.model = model.
func setProviderModel(content, model string) (string, error) {
	var doc yaml.Node
	if err := yaml.Unmarshal([]byte(content), &doc); err != nil {
		return "", fmt.Errorf("YAML inválido: %w", err)
	}

	quoted, _ := json.Marshal(model) // string JSON = escalar YAML entre aspas duplas
	value := string(quoted)

	nl := "\n"
	if strings.Contains(content, "\r\n") {
		nl = "\r\n"
	}
	lines := strings.Split(content, "\n")

	var root *yaml.Node
	if doc.Kind == yaml.DocumentNode && len(doc.Content) > 0 {
		root = doc.Content[0]
	}
	if root != nil && root.Kind != yaml.MappingNode {
		return "", fmt.Errorf("o arquivo precisa ser um mapa YAML")
	}

	providerKey, provider := mappingEntry(root, "provider")
	if providerKey == nil {
		out := content
		if out != "" && !strings.HasSuffix(out, "\n") {
			out += nl
		}
		return out + "provider:" + nl + "  model: " + value + nl, nil
	}
	if provider.Kind != yaml.MappingNode || provider.Style&yaml.FlowStyle != 0 {
		return "", fmt.Errorf("provider precisa ser um mapa em blocos para trocar o model")
	}

	modelKey, modelVal := mappingEntry(provider, "model")
	if modelKey == nil {
		indent := "  "
		if len(provider.Content) > 0 {
			indent = strings.Repeat(" ", provider.Content[0].Column-1)
		}
		i := providerKey.Line // índice 0-based da linha seguinte a "provider:"
		cr := ""
		if strings.HasSuffix(lines[providerKey.Line-1], "\r") {
			cr = "\r"
		}
		newLine := indent + "model: " + value + cr
		lines = append(lines[:i], append([]string{newLine}, lines[i:]...)...)
		return strings.Join(lines, "\n"), nil
	}
	if modelVal.Line != modelKey.Line {
		return "", fmt.Errorf("provider.model em várias linhas não é suportado")
	}

	i := modelKey.Line - 1
	old := lines[i]
	cr := ""
	if strings.HasSuffix(old, "\r") {
		cr = "\r"
	}
	newLine := old[:modelKey.Column-1] + "model: " + value
	comment := modelVal.LineComment
	if comment == "" {
		comment = modelKey.LineComment
	}
	if comment != "" {
		newLine += " " + comment
	}
	lines[i] = newLine + cr
	return strings.Join(lines, "\n"), nil
}

// mappingEntry devolve o nó da chave e do valor de key em m (nil se ausente).
func mappingEntry(m *yaml.Node, key string) (*yaml.Node, *yaml.Node) {
	if m == nil {
		return nil, nil
	}
	for i := 0; i+1 < len(m.Content); i += 2 {
		if m.Content[i].Value == key {
			return m.Content[i], m.Content[i+1]
		}
	}
	return nil, nil
}

// writeFileAtomic grava data num temporário no mesmo diretório e o renomeia
// sobre path, para que uma falha no meio nunca deixe o config truncado.
func writeFileAtomic(path string, data []byte, perm os.FileMode) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), ".config-*.yaml")
	if err != nil {
		return fmt.Errorf("config: não foi possível gravar %s: %w", path, err)
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName) // no-op após o Rename

	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return fmt.Errorf("config: não foi possível gravar %s: %w", path, err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("config: não foi possível gravar %s: %w", path, err)
	}
	if err := os.Chmod(tmpName, perm); err != nil {
		return fmt.Errorf("config: não foi possível gravar %s: %w", path, err)
	}
	if err := os.Rename(tmpName, path); err != nil {
		return fmt.Errorf("config: não foi possível gravar %s: %w", path, err)
	}
	return nil
}
```

Nota: se `TestSaveModel_KeepsInlineComment` falhar porque o yaml.v3 anexa o comentário com `#` já incluso em outro nó, ajuste só a fonte do comentário (`modelVal`/`modelKey`) — o teste é a especificação.

- [ ] **Step 4: Documentar no template** (`internal/config/defaults.go`): trocar a linha `  model: "llama3.2"` por

```yaml
  model: "llama3.2" # também pode ser trocado pelo seletor no topo do modal
```

(`TestDefault_MatchesTemplateYAML` e `TestSaveModel_ChangesOnlyModelLineOfDefaultTemplate` continuam válidos; atualize o `want` do diff para `  model: "llama3.1:8b" # também pode ser trocado pelo seletor no topo do modal`.)

- [ ] **Step 5: Run to verify it passes**

Run: `go test ./internal/config/ -v && go vet ./internal/config/`
Expected: PASS (inclusive os testes existentes de `config_test.go`).

- [ ] **Step 6: Commit**

```bash
git add internal/config/save.go internal/config/save_test.go internal/config/defaults.go
git commit -m "feat(config): SaveModel grava provider.model preservando o arquivo"
```

---

### Task 3: bindings `ListModels`/`SetModel` e `State.model`

**Files:**
- Modify: `internal/app/service.go`, `internal/app/service_test.go`

**Interfaces:**
- Consumes: `llm.ListModels(ctx, baseURL, apiKey) ([]string, error)` (Task 1).
- Produces:
  - `State.Model string` (`json:"model"`).
  - `func (s *ImproveService) ListModels() ([]string, error)` — erros em PT-BR.
  - `func (s *ImproveService) SetModel(model string) error`.
  - `type ModelSaver func(model string) error` e `func (h *Host) SetModelSaver(save ModelSaver)`.

- [ ] **Step 1: Write the failing tests** (anexar a `internal/app/service_test.go`; adicionar `net/http` e `net/http/httptest` aos imports)

```go
// ---- modelo ----------------------------------------------------------------

func configWithBaseURL(baseURL string) *config.Config {
	cfg := config.Default()
	cfg.Provider.BaseURL = baseURL
	cfg.Provider.Model = "llama3.2"
	return cfg
}

func TestStateIncludesCurrentModel(t *testing.T) {
	h := newHarness(t, nil, canSimulate)
	h.host.Configure(configWithBaseURL("http://x/v1"), nil)

	if got := h.svc.GetState().Model; got != "llama3.2" {
		t.Errorf("State.Model = %q, want llama3.2", got)
	}
}

func TestListModelsReturnsProviderModels(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":[{"id":"qwen3"},{"id":"llama3.2:latest"}]}`))
	}))
	defer server.Close()

	h := newHarness(t, nil, canSimulate)
	h.host.Configure(configWithBaseURL(server.URL), nil)

	got, err := h.svc.ListModels()
	if err != nil {
		t.Fatalf("ListModels() error = %v", err)
	}
	if strings.Join(got, ",") != "llama3.2:latest,qwen3" {
		t.Errorf("got %v", got)
	}
}

func TestListModelsUnreachableSuggestsOllamaServe(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	url := server.URL
	server.Close()

	h := newHarness(t, nil, canSimulate)
	h.host.Configure(configWithBaseURL(url), nil)

	_, err := h.svc.ListModels()
	if err == nil || !strings.Contains(err.Error(), "ollama serve") {
		t.Fatalf("err = %v, want hint with 'ollama serve'", err)
	}
}

func TestListModelsAPIErrorIsPTBR(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":{"message":"invalid api key"}}`))
	}))
	defer server.Close()

	h := newHarness(t, nil, canSimulate)
	h.host.Configure(configWithBaseURL(server.URL), nil)

	_, err := h.svc.ListModels()
	if err == nil || !strings.Contains(err.Error(), "Não foi possível listar os modelos") || !strings.Contains(err.Error(), "api_key") {
		t.Fatalf("err = %v", err)
	}
}

func TestSetModelCallsSaverWithTrimmedModel(t *testing.T) {
	h := newHarness(t, nil, canSimulate)
	var got []string
	h.host.SetModelSaver(func(m string) error { got = append(got, m); return nil })

	if err := h.svc.SetModel("  qwen3  "); err != nil {
		t.Fatalf("SetModel() error = %v", err)
	}
	if len(got) != 1 || got[0] != "qwen3" {
		t.Errorf("saver calls = %v", got)
	}
}

func TestSetModelRejectsEmpty(t *testing.T) {
	h := newHarness(t, nil, canSimulate)
	called := false
	h.host.SetModelSaver(func(string) error { called = true; return nil })

	if err := h.svc.SetModel("  "); err == nil {
		t.Fatal("SetModel() error = nil, want error")
	}
	if called {
		t.Error("saver should not be called")
	}
}

func TestSetModelWrapsSaverError(t *testing.T) {
	h := newHarness(t, nil, canSimulate)
	h.host.SetModelSaver(func(string) error { return errors.New("disco cheio") })

	err := h.svc.SetModel("qwen3")
	if err == nil || !strings.Contains(err.Error(), "Não foi possível salvar o modelo") || !strings.Contains(err.Error(), "disco cheio") {
		t.Fatalf("err = %v", err)
	}
}

func TestSetModelWithoutSaverFails(t *testing.T) {
	h := newHarness(t, nil, canSimulate)
	if err := h.svc.SetModel("qwen3"); err == nil {
		t.Fatal("SetModel() error = nil, want error")
	}
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `go test ./internal/app/ -run 'Model' -v`
Expected: FAIL — `State.Model`, `ListModels`, `SetModel`, `SetModelSaver` indefinidos.

- [ ] **Step 3: Implement** (`internal/app/service.go`)

3a. Constante, junto das outras defaults:

```go
	defaultListModelsTimeout = 5 * time.Second
```

3b. `State` ganha o campo (depois de `Error`):

```go
	Model      string      `json:"model"`
```

3c. Tipo do saver (perto de `Window`):

```go
// ModelSaver persists the chosen model (config.yaml) and applies it; main.go
// provides it through Host.SetModelSaver.
type ModelSaver func(model string) error
```

3d. Campo em `ImproveService` (junto de `warning`): `saveModel ModelSaver`.

3e. Em `stateLocked`, no literal de `State`: `Model: s.cfg.Provider.Model,`.

3f. Bindings (depois de `Close`):

```go
// ListModels returns the models offered by the provider (for Ollama, the
// installed ones), sorted. Errors are PT-BR and user-facing.
func (s *ImproveService) ListModels() ([]string, error) {
	s.mu.Lock()
	p := s.cfg.Provider
	s.mu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), defaultListModelsTimeout)
	defer cancel()
	models, err := llm.ListModels(ctx, p.BaseURL, p.APIKey)
	if err != nil {
		return nil, errors.New(listModelsMessage(err, p.BaseURL))
	}
	return models, nil
}

// SetModel persists model as provider.model and reloads the configuration;
// the new model arrives on state:changed. Requests already running keep
// the previous model.
func (s *ImproveService) SetModel(model string) error {
	model = strings.TrimSpace(model)
	if model == "" {
		return errors.New("Escolha um modelo.")
	}
	s.mu.Lock()
	save := s.saveModel
	s.mu.Unlock()
	if save == nil {
		return errors.New("Não é possível trocar o modelo agora.")
	}
	if err := save(model); err != nil {
		return fmt.Errorf("Não foi possível salvar o modelo: %w", err)
	}
	return nil
}
```

3g. Mensagens (depois de `errorMessage`):

```go
// listModelsMessage maps ListModels errors to PT-BR, user-facing messages.
func listModelsMessage(err error, baseURL string) string {
	var apiErr *llm.APIError
	switch {
	case errors.Is(err, llm.ErrUnreachable):
		return fmt.Sprintf("Não foi possível conectar em %s. O Ollama está rodando? (ollama serve)", baseURL)
	case errors.Is(err, context.DeadlineExceeded):
		return "Tempo esgotado ao listar os modelos."
	case errors.As(err, &apiErr):
		msg := "Não foi possível listar os modelos: " + apiErr.Message
		if apiErr.Status == 401 || apiErr.Status == 403 {
			msg += " — verifique a api_key"
		}
		return msg
	}
	return "Não foi possível listar os modelos: " + err.Error()
}
```

3h. Host (depois de `SetWarning`):

```go
// SetModelSaver sets how SetModel persists and applies a model choice.
func (h *Host) SetModelSaver(save ModelSaver) {
	s := h.s
	s.mu.Lock()
	defer s.mu.Unlock()
	s.saveModel = save
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `go test ./internal/app/ -v && go vet ./internal/app/`
Expected: PASS (novos e antigos).

- [ ] **Step 5: Commit**

```bash
git add internal/app/service.go internal/app/service_test.go
git commit -m "feat(app): bindings ListModels/SetModel e modelo atual no State"
```

---

### Task 4: wiring no `main.go` + bindings TS

**Files:**
- Modify: `main.go` (logo depois da definição de `reload`, ~linha 215)
- Regenerate: `frontend/bindings/github.com/gustavofreitas/prompt-improve/internal/app/{improveservice,models}.ts`

**Interfaces:**
- Consumes: `config.SaveModel` (Task 2), `Host.SetModelSaver`/`app.ModelSaver` (Task 3), `reload`, `mu`, `cfgPath` (já em `main.go`).
- Produces: bindings TS `ImproveService.ListModels(): Promise<string[]>`, `ImproveService.SetModel(model: string): Promise<void>`, `State.model: string`.

- [ ] **Step 1: Injetar o saver** (depois do fechamento de `reload := func() {...}`):

```go
	// Model picker: persist provider.model in config.yaml, then reload so
	// the new runner and state:changed (with the model) take effect.
	host.SetModelSaver(func(model string) error {
		mu.Lock()
		path := cfgPath
		mu.Unlock()
		if path == "" {
			return errors.New("o caminho do config.yaml é desconhecido")
		}
		if err := config.SaveModel(path, model); err != nil {
			return err
		}
		reload()
		return nil
	})
```

(Adicionar `"errors"` aos imports se ainda não houver. `loadConfig` devolve o `path` mesmo quando o `Load` falha, então `cfgPath` está preenchido no startup.)

- [ ] **Step 2: Regenerar bindings**

Run: `wails3 generate bindings -ts`
Expected: `improveservice.ts` com `ListModels` e `SetModel`; `models.ts` com `"model": string` em `State`.

- [ ] **Step 3: Verificar build e testes**

Run: `go vet ./... && go build ./... && go test ./...`
Expected: tudo OK.

- [ ] **Step 4: Commit**

```bash
git add main.go frontend/bindings
git commit -m "feat: persiste o modelo escolhido no config.yaml e recarrega"
```

---

### Task 5: seletor de modelo no frontend

**Files:**
- Create: `frontend/src/components/ui/native-select.tsx` (via shadcn CLI), `frontend/src/components/ModelPicker.tsx`
- Modify: `frontend/src/hooks/useImprove.ts`, `frontend/src/App.tsx`, `frontend/src/App.test.tsx`, `frontend/src/test/improveServiceMock.ts`, `CLAUDE.md`

**Interfaces:**
- Consumes: bindings da Task 4 (`ListModels`, `SetModel`, `State.model`).
- Produces: `useImprove()` passa a expor `model: string`, `models: string[]`, `modelsError: string`, `modelSaving: boolean`, `setModel(model: string): Promise<void>`.

**Decisão de UX:** a lista é buscada quando o modal hidrata (`GetState`) e a cada `selection:new` (cada abertura pelo atalho). Um `<select>` nativo precisa das opções *antes* de abrir, então buscar no clique criaria uma corrida. É uma chamada local barata.

- [ ] **Step 1: Adicionar o componente shadcn**

Run: `cd frontend && npx shadcn@latest add native-select`
Confira os nomes exportados em `src/components/ui/native-select.tsx` (esperado: `NativeSelect`, `NativeSelectOption`) e ajuste o import do Step 4 se forem diferentes.

- [ ] **Step 2: Atualizar o mock** (`frontend/src/test/improveServiceMock.ts`)

No objeto `ImproveService`, adicionar `model: ""` aos dois estados padrão de `GetState` e os métodos:

```ts
  ListModels: vi.fn().mockResolvedValue([]),
  SetModel: vi.fn().mockResolvedValue(undefined),
```

Em `resetImproveServiceMock`:

```ts
  ImproveService.ListModels.mockReset();
  ImproveService.ListModels.mockResolvedValue([]);
  ImproveService.SetModel.mockReset();
  ImproveService.SetModel.mockResolvedValue(undefined);
```

- [ ] **Step 3: Write the failing tests** (`frontend/src/App.test.tsx`)

Em `mockState`, adicionar `model: string` ao tipo dos overrides e `model: "llama3.2:latest"` ao objeto padrão. Depois, adicionar dentro do `describe("<App />")`:

```tsx
  describe("seletor de modelo", () => {
    it("mostra o modelo atual e os modelos instalados", async () => {
      ImproveService.ListModels.mockResolvedValue(["gpt-oss:120b-cloud", "llama3.2:latest"]);
      await renderAppHydrated();

      const select = screen.getByRole("combobox", { name: "Modelo" }) as HTMLSelectElement;
      await waitFor(() => expect(select.options).toHaveLength(2));
      expect(select.value).toBe("llama3.2:latest");
    });

    it("mantém o modelo configurado mesmo fora da lista", async () => {
      ImproveService.ListModels.mockResolvedValue(["llama3.2:latest"]);
      await renderAppHydrated(mockState({ model: "llama3.2" }));

      const select = screen.getByRole("combobox", { name: "Modelo" }) as HTMLSelectElement;
      await waitFor(() => expect(select.options).toHaveLength(2));
      expect(select.value).toBe("llama3.2");
    });

    it("trocar o modelo chama SetModel", async () => {
      const user = userEvent.setup();
      ImproveService.ListModels.mockResolvedValue(["llama3.2:latest", "qwen3"]);
      await renderAppHydrated();

      const select = screen.getByRole("combobox", { name: "Modelo" });
      await waitFor(() => expect((select as HTMLSelectElement).options).toHaveLength(2));
      await user.selectOptions(select, "qwen3");

      await waitFor(() => expect(ImproveService.SetModel).toHaveBeenCalledWith("qwen3"));
    });

    it("mostra o erro da listagem e mantém o modelo atual", async () => {
      ImproveService.ListModels.mockRejectedValue(
        new Error("Não foi possível conectar em http://localhost:11434/v1. O Ollama está rodando? (ollama serve)")
      );
      await renderAppHydrated();

      expect(await screen.findByText(/ollama serve/)).toBeInTheDocument();
      const select = screen.getByRole("combobox", { name: "Modelo" }) as HTMLSelectElement;
      expect(select.value).toBe("llama3.2:latest");
    });

    it("mostra o erro quando SetModel falha", async () => {
      const user = userEvent.setup();
      ImproveService.ListModels.mockResolvedValue(["llama3.2:latest", "qwen3"]);
      ImproveService.SetModel.mockRejectedValue(new Error("Não foi possível salvar o modelo: disco cheio"));
      await renderAppHydrated();

      const select = screen.getByRole("combobox", { name: "Modelo" });
      await waitFor(() => expect((select as HTMLSelectElement).options).toHaveLength(2));
      await user.selectOptions(select, "qwen3");

      expect(await screen.findByText(/disco cheio/)).toBeInTheDocument();
    });

    it("fica desabilitado durante o stream", async () => {
      const user = userEvent.setup();
      ImproveService.ListModels.mockResolvedValue(["llama3.2:latest"]);
      await renderAppHydrated();

      await user.click(screen.getByText("Deixar formal"));
      await waitFor(() => expect(ImproveService.Start).toHaveBeenCalled());

      expect(screen.getByRole("combobox", { name: "Modelo" })).toBeDisabled();
    });

    it("atualiza o modelo com state:changed e recarrega a lista a cada seleção", async () => {
      ImproveService.ListModels.mockResolvedValue(["llama3.2:latest", "qwen3"]);
      await renderAppHydrated();
      await waitFor(() => expect(ImproveService.ListModels).toHaveBeenCalledTimes(1));

      act(() => emit("state:changed", { ...mockState(), model: "qwen3" }));
      const select = screen.getByRole("combobox", { name: "Modelo" }) as HTMLSelectElement;
      await waitFor(() => expect(select.value).toBe("qwen3"));

      act(() => emit("selection:new", { text: "outro", canReplace: true, warning: "" }));
      await waitFor(() => expect(ImproveService.ListModels).toHaveBeenCalledTimes(2));
    });
  });
```

(Se o clique em "Deixar formal" não disparar `Start` neste arquivo, use o mesmo padrão dos testes existentes de Start, com busca + `{Enter}`. Se `emit` tiver outra assinatura em `test/wailsRuntimeMock.ts`, siga a usada pelos testes existentes.)

- [ ] **Step 4: Run to verify it fails**

Run: `npm --prefix frontend test -- --run App.test.tsx`
Expected: FAIL — combobox "Modelo" não encontrado.

- [ ] **Step 5: Implementar o hook** (`frontend/src/hooks/useImprove.ts`)

5a. Em `ImproveState`:

```ts
  /** provider.model currently in use (State.model). */
  model: string;
  /** Models offered by the provider (ListModels), sorted. */
  models: string[];
  /** ListModels/SetModel failure (PT-BR), shown next to the picker. */
  modelsError: string;
  /** True while SetModel is saving + reloading the config. */
  modelSaving: boolean;
```

`initialState`: `model: "", models: [], modelsError: "", modelSaving: false,`.
`UseImproveResult`: `setModel: (model: string) => Promise<void>;`.

5b. Antes do `useEffect` dos eventos:

```ts
  const loadModels = useCallback(() => {
    ImproveService.ListModels()
      .then((models: string[] | null) => {
        setState((s) => ({ ...s, models: models ?? [], modelsError: "" }));
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setState((s) => ({ ...s, models: [], modelsError: message }));
      });
  }, []);
```

5c. No `useEffect`: no handler de `selection:new`, depois de `setSelectionSeq(...)`, chamar `loadModels();`. No handler de `state:changed` e no `.then` do `GetState`, incluir `model: payload.model` / `model: s.model`. Depois do `GetState().then(...)` (dentro do `.then`, após o `setState`), chamar `loadModels();`. Adicionar `loadModels` às dependências do efeito (`[handleEvent, loadModels]`).

5d. Nova ação:

```ts
  const setModel = useCallback(async (model: string) => {
    setState((s) => ({ ...s, modelSaving: true, modelsError: "" }));
    try {
      await ImproveService.SetModel(model);
      setState((s) => ({ ...s, model, modelSaving: false }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState((s) => ({ ...s, modelSaving: false, modelsError: message }));
    }
  }, []);
```

Incluir `setModel` no objeto retornado.

- [ ] **Step 6: Componente** (`frontend/src/components/ModelPicker.tsx`)

```tsx
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

interface ModelPickerProps {
  model: string;
  models: string[];
  /** ListModels/SetModel failure (PT-BR). */
  error: string;
  disabled: boolean;
  onChange: (model: string) => void;
}

export function ModelPicker({ model, models, error, disabled, onChange }: ModelPickerProps) {
  // The configured model stays selectable even when the provider doesn't
  // list it (e.g. "llama3.2" vs Ollama's "llama3.2:latest") or listing failed.
  const options = model && !models.includes(model) ? [model, ...models] : models;

  return (
    <div className="flex min-w-0 items-center gap-2 [--wails-draggable:no-drag]">
      <NativeSelect
        aria-label="Modelo"
        value={model}
        disabled={disabled || options.length === 0}
        onChange={(event) => {
          if (event.target.value !== model) onChange(event.target.value);
        }}
        className="h-7 max-w-56 text-xs"
      >
        {options.map((m) => (
          <NativeSelectOption key={m} value={m}>
            {m}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {error && (
        <span role="status" title={error} className="min-w-0 truncate text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
```

(Se o `NativeSelect` gerado envolver o `<select>` num wrapper, passe a largura por `className` conforme a API real do arquivo gerado; `aria-label`, `value`, `disabled` e `onChange` precisam chegar ao `<select>`.)

- [ ] **Step 7: Header** (`frontend/src/App.tsx`)

Desestruturar `model, models, modelsError, modelSaving, setModel` de `useImprove()`, importar `ModelPicker` e trocar o `<span>` do título no `<header>` por:

```tsx
        <div className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 text-sm font-medium">Prompt Improve</span>
          <ModelPicker
            model={model}
            models={models}
            error={modelsError}
            disabled={isStreaming || modelSaving}
            onChange={(m) => void setModel(m)}
          />
        </div>
```

Mover `const isStreaming = status === "streaming";` para antes do `return` (já está), garantindo que seja declarado antes do JSX.

- [ ] **Step 8: Run to verify it passes**

Run: `npm --prefix frontend test -- --run && npm --prefix frontend run build`
Expected: todos os testes PASS; build sem erros de TS.

- [ ] **Step 9: Checklist manual** (`CLAUDE.md`, seção **Todos os SOs**), adicionar:

```markdown
- Seletor de modelo no topo do modal: lista os modelos instalados no
  Ollama, a troca grava `provider.model` no `config.yaml` (resto do arquivo
  intacto) e vale para a próxima melhoria; com o Ollama parado, mostra só o
  modelo atual e o erro com `ollama serve`.
```

- [ ] **Step 10: Commit**

```bash
git add frontend/src CLAUDE.md frontend/components.json frontend/package.json frontend/package-lock.json
git commit -m "feat(frontend): seletor de modelo no header do modal"
```

---

## Verificação end-to-end

1. `go vet ./... && go test ./...` e `npm --prefix frontend test -- --run`: tudo verde.
2. `wails3 dev` com o Ollama rodando: abrir o modal (`⌘⇧Y`). O seletor lista `gpt-oss:120b-cloud`, `llama3.1:8b`, `llama3.2:latest` e `llama3:latest`, com o modelo atual selecionado.
3. Trocar para `llama3.1:8b` e rodar uma ação. O stream vem do novo modelo e o `config.yaml` (`~/Library/Application Support/prompt-improve/config.yaml`) muda só na linha `model:` (`git diff --no-index` contra uma cópia feita antes).
4. Fechar e reabrir o app: o modelo escolhido continua selecionado.
5. `ollama stop`/parar o serviço e reabrir o modal: aparece o erro com `ollama serve`, o seletor mostra só o modelo atual e o restante do modal funciona.
6. Durante um stream, o seletor fica desabilitado.

## Execução

Recomendo **Native**, porque são 5 tasks sequenciais e bem acopladas: cada uma consome as assinaturas da anterior, e o design já está fechado no plano. Uma revisão final do branch inteiro cobre bem o risco. Se preferir revisão por task, use **Subagent-driven**.
