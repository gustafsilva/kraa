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
	if len(diffs) != 1 || diffs[0] != `  model: "llama3.1:8b" # também pode ser trocado pelo seletor no topo do modal` {
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
