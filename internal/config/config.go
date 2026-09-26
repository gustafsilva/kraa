// Package config loads, validates and provides defaults for the Prompt
// Improve user configuration (config.yaml). It has no dependency on Wails
// so it can be unit tested in isolation and reused by internal/llm,
// internal/improver and internal/app.
package config

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// EnvAPIKey is the environment variable that, when non-empty, overrides
// provider.api_key after Load. It is never written back to disk.
const EnvAPIKey = "PROMPT_IMPROVE_API_KEY"

// DefaultHotkey is used whenever Hotkey is empty, either because the field
// was omitted from the YAML or explicitly set to "".
const DefaultHotkey = "CmdOrCtrl+Shift+Y"

const (
	defaultTimeoutSeconds = 60
	defaultMaxInputChars  = 20000
)

// Provider holds the OpenAI-compatible endpoint configuration.
type Provider struct {
	BaseURL        string `yaml:"base_url"`
	APIKey         string `yaml:"api_key"`
	Model          string `yaml:"model"`
	TimeoutSeconds int    `yaml:"timeout_seconds"`
}

// Action is a pre-configured prompt-rewrite action shown in the modal.
type Action struct {
	ID          string `yaml:"id"`
	Category    string `yaml:"category"`
	Label       string `yaml:"label"`
	Instruction string `yaml:"instruction"`
}

// Config is the full user configuration for Prompt Improve.
type Config struct {
	Hotkey        string   `yaml:"hotkey"`
	Provider      Provider `yaml:"provider"`
	MaxInputChars int      `yaml:"max_input_chars"`
	Actions       []Action `yaml:"actions"`
}

// DefaultPath returns the default config file location:
// os.UserConfigDir()/prompt-improve/config.yaml.
func DefaultPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("config: não foi possível localizar o diretório de configuração: %w", err)
	}
	return filepath.Join(dir, "prompt-improve", "config.yaml"), nil
}

// Default returns the built-in default configuration. It is derived by
// parsing the same YAML template written to disk on first run (see
// defaults.go), so the two never drift apart.
func Default() *Config {
	cfg := &Config{}
	if err := yaml.Unmarshal([]byte(defaultConfigYAML), cfg); err != nil {
		// The template is a compile-time constant; a parse failure here is
		// a programming error, not a runtime condition callers can handle.
		panic("config: defaultConfigYAML inválido: " + err.Error())
	}
	cfg.applyDefaults()
	return cfg
}

// Load reads the config at path, creating it with the default template if
// it does not exist yet. Fields omitted from the YAML fall back to their
// defaults, and PROMPT_IMPROVE_API_KEY, if set and non-empty, overrides
// provider.api_key after load (it is never written back to disk).
func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if !os.IsNotExist(err) {
			return nil, fmt.Errorf("config: não foi possível ler %s: %w", path, err)
		}
		if err := writeDefaultFile(path); err != nil {
			return nil, err
		}
		data = []byte(defaultConfigYAML)
	}

	cfg := &Config{}
	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("config: YAML inválido em %s: %w", path, err)
	}
	cfg.applyDefaults()
	cfg.ApplyEnv()

	if err := cfg.Validate(); err != nil {
		return nil, err
	}

	return cfg, nil
}

// writeDefaultFile creates the parent directory (0o755) and writes the
// default template (0o600, since the file may hold an API key).
func writeDefaultFile(path string) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("config: não foi possível criar o diretório %s: %w", dir, err)
	}
	if err := os.WriteFile(path, []byte(defaultConfigYAML), 0o600); err != nil {
		return fmt.Errorf("config: não foi possível criar %s: %w", path, err)
	}
	return nil
}

// ApplyEnv applies environment overrides: PROMPT_IMPROVE_API_KEY, when set
// and non-empty, replaces provider.api_key. Load calls it; callers that fall
// back to Default() (e.g. when Load fails) must call it too.
func (c *Config) ApplyEnv() {
	if apiKey := os.Getenv(EnvAPIKey); apiKey != "" {
		c.Provider.APIKey = apiKey
	}
}

// applyDefaults fills zero-valued fields with their defaults.
func (c *Config) applyDefaults() {
	if c.Hotkey == "" {
		c.Hotkey = DefaultHotkey
	}
	if c.Provider.TimeoutSeconds == 0 {
		c.Provider.TimeoutSeconds = defaultTimeoutSeconds
	}
	if c.MaxInputChars == 0 {
		c.MaxInputChars = defaultMaxInputChars
	}
	if len(c.Actions) == 0 {
		c.Actions = defaultActions()
	}
}

// defaultActions parses the built-in default template independently of
// Default()/applyDefaults() and returns just its actions, so Load can
// backfill the 8 default actions whenever a user's config.yaml omits the
// actions key (or sets it to an empty list) without risking recursion.
func defaultActions() []Action {
	tmp := &Config{}
	if err := yaml.Unmarshal([]byte(defaultConfigYAML), tmp); err != nil {
		panic("config: defaultConfigYAML inválido: " + err.Error())
	}
	return tmp.Actions
}

// Validate checks required fields and action uniqueness. Error messages are
// in PT-BR since they may be surfaced directly in the UI.
func (c *Config) Validate() error {
	if c.Provider.BaseURL == "" {
		return fmt.Errorf("config: base_url não pode ser vazio")
	}
	if c.Provider.Model == "" {
		return fmt.Errorf("config: model não pode ser vazio")
	}
	if c.Provider.TimeoutSeconds < 0 {
		return fmt.Errorf("config: timeout_seconds não pode ser negativo (use 0 para o padrão de %d)", defaultTimeoutSeconds)
	}
	if c.MaxInputChars < 0 {
		return fmt.Errorf("config: max_input_chars não pode ser negativo (use 0 para o padrão de %d)", defaultMaxInputChars)
	}

	seen := make(map[string]struct{}, len(c.Actions))
	for _, a := range c.Actions {
		if a.ID == "" {
			return fmt.Errorf("config: id da ação não pode ser vazio")
		}
		if _, dup := seen[a.ID]; dup {
			return fmt.Errorf("config: id de ação duplicado: %s", a.ID)
		}
		seen[a.ID] = struct{}{}

		if a.Label == "" {
			return fmt.Errorf("config: label da ação %q não pode ser vazio", a.ID)
		}
		if a.Instruction == "" {
			return fmt.Errorf("config: instruction da ação %q não pode ser vazio", a.ID)
		}
	}

	return nil
}

// Action returns the action with the given id, if present.
func (c *Config) Action(id string) (Action, bool) {
	for _, a := range c.Actions {
		if a.ID == id {
			return a, true
		}
	}
	return Action{}, false
}
