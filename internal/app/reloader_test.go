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
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	out := strings.Replace(string(raw), `hotkey: "CmdOrCtrl+Shift+Y"`, `hotkey: "`+hotkey+`"`, 1)
	if hotkey != "CmdOrCtrl+Shift+Y" && out == string(raw) {
		t.Fatal("template sem a linha de hotkey esperada")
	}
	if err := os.WriteFile(path, []byte(out), 0o600); err != nil {
		t.Fatal(err)
	}
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
	if err := os.WriteFile(path, []byte("hotkey: [\n"), 0o600); err != nil {
		t.Fatal(err)
	}
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
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), `model: "outro-modelo"`) || h.svc.GetState().Model != "outro-modelo" {
		t.Fatalf("arquivo/estado não atualizados: model=%q\n%s", h.svc.GetState().Model, raw)
	}
}

func TestSaveProfileWritesFileAndReloads(t *testing.T) {
	r, _, h, path := newTestReloader(t, "CmdOrCtrl+Shift+Y")
	if err := r.SaveProfile(config.Profile{Enabled: true, Text: "Sou tester"}); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
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
