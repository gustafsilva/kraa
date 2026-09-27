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
