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

func (w *Window) Show()         { w.mu.Lock(); w.visible = true; w.shows++; w.mu.Unlock() }
func (w *Window) Hide()         { w.mu.Lock(); w.visible = false; w.hides++; w.mu.Unlock() }
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
// global hotkeys; Wails' own registry would always reject). It keeps the
// callbacks so Fire (POST /__e2e/hotkey) runs whatever the Reloader wired.
type Shortcuts struct {
	mu         sync.Mutex
	registered map[string]func()
}

func (s *Shortcuts) Register(a string, callback func()) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.registered == nil {
		s.registered = map[string]func(){}
	}
	s.registered[a] = callback
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
	_, ok := s.registered[a]
	return ok
}

// Fire runs the callback of every registered accelerator, as if its hotkey
// had been pressed, and returns how many ran. Callbacks run outside the lock:
// the hotkey flow may reload the config, which re-registers shortcuts.
func (s *Shortcuts) Fire() int {
	s.mu.Lock()
	callbacks := make([]func(), 0, len(s.registered))
	for _, cb := range s.registered {
		callbacks = append(callbacks, cb)
	}
	s.mu.Unlock()
	for _, cb := range callbacks {
		cb()
	}
	return len(callbacks)
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
	Shortcuts     *Shortcuts // pass to app.ReloaderOptions.Shortcuts
	Host          Host       // set after app.New, before Run
	Reload        func()     // re-reads config.yaml; set after the Reloader exists
	Close         func()     // cancels the in-flight stream (ImproveService.Close)

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
		Shortcuts:     &Shortcuts{},
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
		"/__e2e/hotkey":    http.MethodPost,
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
	case "/__e2e/hotkey":
		// Same optional {"selection": …} body as trigger, but goes through
		// the callback the Reloader registered (proves the OnHotkey wiring).
		var body struct {
			Selection *string `json:"selection"`
		}
		if !decode(w, r, &body) {
			return
		}
		h.Keys.setSelection(body.Selection)
		if h.Shortcuts.Fire() == 0 {
			http.Error(w, "nenhum atalho registrado", http.StatusNotFound)
			return
		}
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
		// Close first: it cancels a stream left by the previous test, and
		// its Hide must not survive in the window counters reset below.
		if h.Close != nil {
			h.Close()
		}
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
