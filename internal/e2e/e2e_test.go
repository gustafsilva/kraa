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
	fired := 0
	if err := s.Register("CmdOrCtrl+Shift+Y", func() { fired++ }); err != nil || !s.IsRegistered("CmdOrCtrl+Shift+Y") {
		t.Fatal("Register/IsRegistered")
	}
	if n := s.Fire(); n != 1 || fired != 1 {
		t.Fatalf("Fire() = %d, callback chamado %d vez(es); want 1 e 1", n, fired)
	}
	s.Unregister("CmdOrCtrl+Shift+Y")
	if s.IsRegistered("CmdOrCtrl+Shift+Y") {
		t.Fatal("Unregister")
	}
}

func TestHotkeyFiresRegisteredCallback(t *testing.T) {
	h, _, hd, _ := setup(t)
	if rec := do(t, hd, "POST", "/__e2e/hotkey", ""); rec.Code != http.StatusNotFound || !strings.Contains(rec.Body.String(), "nenhum atalho registrado") {
		t.Fatalf("sem atalho: code = %d body = %q; want 404 com \"nenhum atalho registrado\"", rec.Code, rec.Body.String())
	}

	fired := 0
	h.Shortcuts.Register("CmdOrCtrl+Shift+Y", func() { fired++ })
	if rec := do(t, hd, "POST", "/__e2e/hotkey", ""); rec.Code != http.StatusNoContent {
		t.Fatalf("code = %d; want 204", rec.Code)
	}
	if fired != 1 {
		t.Fatalf("callback chamado %d vez(es); want 1", fired)
	}

	h.Shortcuts.Unregister("CmdOrCtrl+Shift+Y")
	if rec := do(t, hd, "POST", "/__e2e/hotkey", ""); rec.Code != http.StatusNotFound {
		t.Fatalf("após Unregister: code = %d; want 404", rec.Code)
	}
	if fired != 1 {
		t.Fatalf("callback desregistrado chamado: %d", fired)
	}
}

func TestResetClosesBeforeClearingFakes(t *testing.T) {
	h, _, hd, _ := setup(t)
	closes := 0
	// Mirrors ImproveService.Close: cancels the stream and hides the window.
	h.Close = func() { closes++; h.Window.Hide() }
	h.Window.Show()

	do(t, hd, "POST", "/__e2e/reset", "")
	if closes != 1 {
		t.Fatalf("closes = %d; want 1", closes)
	}
	// Close ran first, so its Hide was wiped by the fake reset.
	if got := do(t, hd, "GET", "/__e2e/state", "").Body.String(); !strings.Contains(got, `"window":{"visible":false,"shows":0,"hides":0}`) {
		t.Fatalf("state = %s; want window zerada", got)
	}
}

// Pins the documented ruling R9 limitation (internal/platform/capture.go's
// Capture doc comment; site/src/content/docs/plataformas/privacidade.mdx):
// with an empty/non-text clipboard, platform.saveClipboard has nothing to
// restore, so the capture sentinel stays on the clipboard. This is not a
// newly found bug; changing it is a product decision, not a test fix.
func TestTriggerWithoutSelectionOnEmptyClipboardLeavesSentinel(t *testing.T) {
	h, _, hd, _ := setup(t)
	do(t, hd, "POST", "/__e2e/trigger", `{}`)
	text, ok := h.Clipboard.Text()
	if !ok || !strings.HasPrefix(text, "kraa-sentinel-") {
		t.Fatalf("clipboard = %q (ok=%v); want prefixo kraa-sentinel-", text, ok)
	}
}
