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
	if err := os.WriteFile(path, []byte("hotkey: [\n"), 0o600); err != nil {
		t.Fatal(err)
	}
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
