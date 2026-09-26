package config

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestDefaultPath(t *testing.T) {
	got, err := DefaultPath()
	if err != nil {
		t.Fatalf("DefaultPath() error = %v", err)
	}

	userDir, err := os.UserConfigDir()
	if err != nil {
		t.Fatalf("os.UserConfigDir() error = %v", err)
	}
	want := filepath.Join(userDir, "prompt-improve", "config.yaml")

	if got != want {
		t.Errorf("DefaultPath() = %q, want %q", got, want)
	}
}

func TestDefault_MatchesTemplateYAML(t *testing.T) {
	parsed := &Config{}
	if err := yaml.Unmarshal([]byte(defaultConfigYAML), parsed); err != nil {
		t.Fatalf("unmarshal defaultConfigYAML: %v", err)
	}
	parsed.applyDefaults()

	got := Default()
	if !reflect.DeepEqual(got, parsed) {
		t.Errorf("Default() = %+v, want %+v (parsed from template)", got, parsed)
	}
}

func TestDefault_HasEightValidActions(t *testing.T) {
	cfg := Default()
	if len(cfg.Actions) != 8 {
		t.Fatalf("len(Default().Actions) = %d, want 8", len(cfg.Actions))
	}
	if err := cfg.Validate(); err != nil {
		t.Errorf("Default().Validate() error = %v", err)
	}

	promptCount, mensagemCount := 0, 0
	for _, a := range cfg.Actions {
		switch a.Category {
		case "Prompt":
			promptCount++
		case "Mensagem":
			mensagemCount++
		default:
			t.Errorf("unexpected category %q for action %q", a.Category, a.ID)
		}
	}
	if promptCount != 3 {
		t.Errorf("Prompt actions = %d, want 3", promptCount)
	}
	if mensagemCount != 5 {
		t.Errorf("Mensagem actions = %d, want 5", mensagemCount)
	}
}

func TestLoad_CreatesDefaultFileWhenMissing(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "sub", "config.yaml")

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	want := Default()
	if !reflect.DeepEqual(cfg, want) {
		t.Errorf("Load() = %+v, want %+v", cfg, want)
	}

	if _, err := os.Stat(path); err != nil {
		t.Fatalf("config file was not created: %v", err)
	}
}

func TestLoad_ReadsExistingValidYAML(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	content := `
hotkey: "Ctrl+Alt+P"
provider:
  base_url: "http://example.com/v1"
  api_key: "secret"
  model: "gpt-test"
  timeout_seconds: 30
max_input_chars: 5000
actions:
  - id: only-action
    category: Teste
    label: Ação de teste
    instruction: "Faça algo. Responda apenas com o texto reescrito."
`
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("setup WriteFile: %v", err)
	}

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.Hotkey != "Ctrl+Alt+P" {
		t.Errorf("Hotkey = %q, want Ctrl+Alt+P", cfg.Hotkey)
	}
	if cfg.Provider.BaseURL != "http://example.com/v1" {
		t.Errorf("BaseURL = %q", cfg.Provider.BaseURL)
	}
	if cfg.Provider.APIKey != "secret" {
		t.Errorf("APIKey = %q", cfg.Provider.APIKey)
	}
	if cfg.Provider.TimeoutSeconds != 30 {
		t.Errorf("TimeoutSeconds = %d, want 30", cfg.Provider.TimeoutSeconds)
	}
	if cfg.MaxInputChars != 5000 {
		t.Errorf("MaxInputChars = %d, want 5000", cfg.MaxInputChars)
	}
	if len(cfg.Actions) != 1 || cfg.Actions[0].ID != "only-action" {
		t.Errorf("Actions = %+v", cfg.Actions)
	}
}

func TestLoad_MissingFieldsGetDefaults(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	content := `
provider:
  base_url: "http://example.com/v1"
  model: "gpt-test"
actions:
  - id: only-action
    category: Teste
    label: Ação de teste
    instruction: "Faça algo. Responda apenas com o texto reescrito."
`
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("setup WriteFile: %v", err)
	}

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.Hotkey != DefaultHotkey {
		t.Errorf("Hotkey = %q, want default %q", cfg.Hotkey, DefaultHotkey)
	}
	if cfg.Provider.TimeoutSeconds != 60 {
		t.Errorf("TimeoutSeconds = %d, want 60", cfg.Provider.TimeoutSeconds)
	}
	if cfg.MaxInputChars != 20000 {
		t.Errorf("MaxInputChars = %d, want 20000", cfg.MaxInputChars)
	}
}

func TestLoad_EmptyBaseURLFails(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	content := `
provider:
  base_url: ""
  model: "gpt-test"
actions: []
`
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("setup WriteFile: %v", err)
	}

	if _, err := Load(path); err == nil {
		t.Fatal("Load() error = nil, want error for empty base_url")
	}
}

func TestLoad_DuplicateActionIDFails(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	content := `
provider:
  base_url: "http://example.com/v1"
  model: "gpt-test"
actions:
  - id: dup
    category: Teste
    label: Ação 1
    instruction: "Faça algo."
  - id: dup
    category: Teste
    label: Ação 2
    instruction: "Faça outra coisa."
`
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("setup WriteFile: %v", err)
	}

	if _, err := Load(path); err == nil {
		t.Fatal("Load() error = nil, want error for duplicate action id")
	}
}

func TestLoad_EnvOverridesAPIKeyWithoutWritingToDisk(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	content := `
provider:
  base_url: "http://example.com/v1"
  api_key: "from-file"
  model: "gpt-test"
`
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("setup WriteFile: %v", err)
	}

	t.Setenv("PROMPT_IMPROVE_API_KEY", "from-env")

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.Provider.APIKey != "from-env" {
		t.Errorf("APIKey = %q, want from-env", cfg.Provider.APIKey)
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if strings.Contains(string(raw), "from-env") {
		t.Error("env override must not be written back to disk")
	}
}

func TestValidate_EmptyModelFails(t *testing.T) {
	cfg := Default()
	cfg.Provider.Model = ""
	if err := cfg.Validate(); err == nil {
		t.Error("Validate() error = nil, want error for empty model")
	}
}

func TestValidate_EmptyLabelFails(t *testing.T) {
	cfg := Default()
	cfg.Actions[0].Label = ""
	if err := cfg.Validate(); err == nil {
		t.Error("Validate() error = nil, want error for empty label")
	}
}

func TestValidate_EmptyInstructionFails(t *testing.T) {
	cfg := Default()
	cfg.Actions[0].Instruction = ""
	if err := cfg.Validate(); err == nil {
		t.Error("Validate() error = nil, want error for empty instruction")
	}
}

func TestLoad_NoActionsKeyBackfillsDefaults(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	content := `
provider:
  base_url: "http://example.com/v1"
  model: "gpt-test"
`
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("setup WriteFile: %v", err)
	}

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	wantIDs := []string{
		"improve-prompt", "add-context", "more-specific",
		"formal", "casual", "shorter", "fix-grammar", "to-english",
	}
	if len(cfg.Actions) != len(wantIDs) {
		t.Fatalf("len(Actions) = %d, want %d", len(cfg.Actions), len(wantIDs))
	}
	for i, id := range wantIDs {
		if cfg.Actions[i].ID != id {
			t.Errorf("Actions[%d].ID = %q, want %q", i, cfg.Actions[i].ID, id)
		}
	}
}

func TestLoad_EmptyActionsListBackfillsDefaults(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	content := `
provider:
  base_url: "http://example.com/v1"
  model: "gpt-test"
actions: []
`
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("setup WriteFile: %v", err)
	}

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if len(cfg.Actions) != 8 {
		t.Fatalf("len(Actions) = %d, want 8", len(cfg.Actions))
	}
	if cfg.Actions[0].ID != "improve-prompt" {
		t.Errorf("Actions[0].ID = %q, want improve-prompt", cfg.Actions[0].ID)
	}
}

func TestDefaultTemplate_PinnedValues(t *testing.T) {
	cfg := Default()

	if cfg.Hotkey != "CmdOrCtrl+Shift+Y" {
		t.Errorf("Hotkey = %q, want CmdOrCtrl+Shift+Y", cfg.Hotkey)
	}
	if cfg.Provider.BaseURL != "http://localhost:11434/v1" {
		t.Errorf("BaseURL = %q, want http://localhost:11434/v1", cfg.Provider.BaseURL)
	}
	if cfg.Provider.APIKey != "" {
		t.Errorf("APIKey = %q, want empty string", cfg.Provider.APIKey)
	}
	if cfg.Provider.Model != "llama3.2" {
		t.Errorf("Model = %q, want llama3.2", cfg.Provider.Model)
	}
	if cfg.Provider.TimeoutSeconds != 60 {
		t.Errorf("TimeoutSeconds = %d, want 60", cfg.Provider.TimeoutSeconds)
	}
	if cfg.MaxInputChars != 20000 {
		t.Errorf("MaxInputChars = %d, want 20000", cfg.MaxInputChars)
	}

	wantActions := []struct {
		id       string
		category string
	}{
		{"improve-prompt", "Prompt"},
		{"add-context", "Prompt"},
		{"more-specific", "Prompt"},
		{"formal", "Mensagem"},
		{"casual", "Mensagem"},
		{"shorter", "Mensagem"},
		{"fix-grammar", "Mensagem"},
		{"to-english", "Mensagem"},
	}
	if len(cfg.Actions) != len(wantActions) {
		t.Fatalf("len(Actions) = %d, want %d", len(cfg.Actions), len(wantActions))
	}
	for i, want := range wantActions {
		got := cfg.Actions[i]
		if got.ID != want.id {
			t.Errorf("Actions[%d].ID = %q, want %q", i, got.ID, want.id)
		}
		if got.Category != want.category {
			t.Errorf("Actions[%d].Category = %q, want %q", i, got.Category, want.category)
		}
	}

	wantInstruction := "Reescreva o prompt a seguir para um LLM: deixe claro objetivo, " +
		"contexto, restrições e formato de saída. Responda apenas com o prompt reescrito."
	improvePrompt, ok := cfg.Action("improve-prompt")
	if !ok {
		t.Fatal(`Action("improve-prompt") not found`)
	}
	if improvePrompt.Instruction != wantInstruction {
		t.Errorf("improve-prompt Instruction = %q, want %q", improvePrompt.Instruction, wantInstruction)
	}
}

func TestValidate_EmptyActionIDFails(t *testing.T) {
	cfg := Default()
	cfg.Actions[0].ID = ""
	if err := cfg.Validate(); err == nil {
		t.Error("Validate() error = nil, want error for empty action id")
	}
}

func TestConfig_Action(t *testing.T) {
	cfg := Default()

	action, ok := cfg.Action("improve-prompt")
	if !ok {
		t.Fatal(`Action("improve-prompt") not found`)
	}
	if action.Category != "Prompt" {
		t.Errorf("Category = %q, want Prompt", action.Category)
	}

	if _, ok := cfg.Action("does-not-exist"); ok {
		t.Error(`Action("does-not-exist") found, want not found`)
	}
}

func TestValidate_NegativeTimeoutFails(t *testing.T) {
	cfg := Default()
	cfg.Provider.TimeoutSeconds = -1
	err := cfg.Validate()
	if err == nil || !strings.Contains(err.Error(), "timeout_seconds") {
		t.Fatalf("Validate() = %v, want timeout_seconds error", err)
	}
}

func TestValidate_NegativeMaxInputCharsFails(t *testing.T) {
	cfg := Default()
	cfg.MaxInputChars = -5
	err := cfg.Validate()
	if err == nil || !strings.Contains(err.Error(), "max_input_chars") {
		t.Fatalf("Validate() = %v, want max_input_chars error", err)
	}
}

func TestLoad_ZeroTimeoutAndMaxInputCharsKeepDefaults(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.yaml")
	yml := "provider:\n  base_url: http://x\n  model: m\n  timeout_seconds: 0\nmax_input_chars: 0\n"
	if err := os.WriteFile(path, []byte(yml), 0o600); err != nil {
		t.Fatalf("setup WriteFile: %v", err)
	}
	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.Provider.TimeoutSeconds != defaultTimeoutSeconds || cfg.MaxInputChars != defaultMaxInputChars {
		t.Fatalf("got timeout=%d max=%d, want defaults", cfg.Provider.TimeoutSeconds, cfg.MaxInputChars)
	}
}

func TestLoad_NegativeTimeoutFails(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.yaml")
	yml := "provider:\n  base_url: http://x\n  model: m\n  timeout_seconds: -3\n"
	if err := os.WriteFile(path, []byte(yml), 0o600); err != nil {
		t.Fatalf("setup WriteFile: %v", err)
	}
	if _, err := Load(path); err == nil {
		t.Fatal("Load() with negative timeout_seconds should fail")
	}
}

func TestApplyEnv_OverridesAPIKeyWhenSet(t *testing.T) {
	cfg := Default()
	cfg.Provider.APIKey = "do-arquivo"
	t.Setenv(EnvAPIKey, "from-env")
	cfg.ApplyEnv()
	if cfg.Provider.APIKey != "from-env" {
		t.Fatalf("APIKey = %q, want from-env", cfg.Provider.APIKey)
	}
}

func TestApplyEnv_KeepsAPIKeyWhenEnvEmpty(t *testing.T) {
	cfg := Default()
	cfg.Provider.APIKey = "do-arquivo"
	t.Setenv(EnvAPIKey, "")
	cfg.ApplyEnv()
	if cfg.Provider.APIKey != "do-arquivo" {
		t.Fatalf("APIKey = %q, want do-arquivo", cfg.Provider.APIKey)
	}
}
