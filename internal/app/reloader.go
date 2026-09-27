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
