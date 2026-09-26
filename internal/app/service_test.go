package app

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gustavofreitas/prompt-improve/internal/config"
	"github.com/gustavofreitas/prompt-improve/internal/improver"
	"github.com/gustavofreitas/prompt-improve/internal/llm"
	"github.com/gustavofreitas/prompt-improve/internal/platform"
)

// ---- fakes ----------------------------------------------------------------

type event struct {
	name string
	data any
}

type fakeEmitter struct {
	mu     sync.Mutex
	events []event
}

func (e *fakeEmitter) Emit(name string, data any) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.events = append(e.events, event{name, data})
}

func (e *fakeEmitter) snapshot() []event {
	e.mu.Lock()
	defer e.mu.Unlock()
	return append([]event(nil), e.events...)
}

// waitFor polls until pred matches some event or the timeout elapses.
func (e *fakeEmitter) waitFor(t *testing.T, pred func(event) bool) event {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		for _, ev := range e.snapshot() {
			if pred(ev) {
				return ev
			}
		}
		time.Sleep(2 * time.Millisecond)
	}
	t.Fatalf("event not emitted; got %+v", e.snapshot())
	return event{}
}

func eventID(ev event) string {
	switch d := ev.data.(type) {
	case ChunkEvent:
		return d.ID
	case DoneEvent:
		return d.ID
	case ErrorEvent:
		return d.ID
	}
	return ""
}

func isEvent(name, id string) func(event) bool {
	return func(ev event) bool { return ev.name == name && eventID(ev) == id }
}

type fakeRunner struct {
	run func(ctx context.Context, r improver.Request, onChunk func(string)) error
}

func (f fakeRunner) Run(ctx context.Context, r improver.Request, onChunk func(string)) error {
	return f.run(ctx, r, onChunk)
}

// recorder is a shared, ordered log of side effects (window, keys, sleep).
type recorder struct {
	mu  sync.Mutex
	log []string
}

func (r *recorder) add(s string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.log = append(r.log, s)
}

func (r *recorder) snapshot() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]string(nil), r.log...)
}

type fakeClipboard struct {
	mu   sync.Mutex
	text string
	has  bool
}

func (c *fakeClipboard) Text() (string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.text, c.has
}

func (c *fakeClipboard) SetText(s string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.text, c.has = s, true
	return true
}

type fakeKeys struct {
	rec       *recorder
	cb        *fakeClipboard
	selection string // what the "source app" copies on Copy(); "" = nothing selected
}

func (k *fakeKeys) Copy() error {
	k.rec.add("copy")
	if k.selection != "" {
		k.cb.SetText(k.selection)
	}
	return nil
}

func (k *fakeKeys) Paste() error {
	txt, _ := k.cb.Text()
	k.rec.add("paste:" + txt)
	return nil
}

type fakeWindow struct{ rec *recorder }

func (w *fakeWindow) Show()         { w.rec.add("show") }
func (w *fakeWindow) Hide()         { w.rec.add("hide") }
func (w *fakeWindow) ReleaseFocus() { w.rec.add("release-focus") }

type harness struct {
	svc  *ImproveService
	host *Host
	em   *fakeEmitter
	rec  *recorder
	cb   *fakeClipboard
	keys *fakeKeys
}

func newHarness(t *testing.T, runner Runner, sess platform.Session) *harness {
	t.Helper()
	rec := &recorder{}
	cb := &fakeClipboard{}
	keys := &fakeKeys{rec: rec, cb: cb}
	em := &fakeEmitter{}
	cfg := config.Default()
	svc, host := New(Options{
		Config:      cfg,
		Runner:      runner,
		Emitter:     em,
		Clipboard:   cb,
		Keys:        keys,
		Window:      &fakeWindow{rec: rec},
		Session:     sess,
		Sleep:       func(d time.Duration) { rec.add(fmt.Sprintf("sleep:%s", d)) },
		CaptureWait: 30 * time.Millisecond,
		PasteSettle: time.Millisecond,
	})
	return &harness{svc: svc, host: host, em: em, rec: rec, cb: cb, keys: keys}
}

var canSimulate = platform.Session{CanSimulateKeys: true}

// ---- Start / Cancel / Close ------------------------------------------------

func TestStartEmitsChunksThenDoneWithSameIDAndCleanedText(t *testing.T) {
	var got improver.Request
	runner := fakeRunner{run: func(ctx context.Context, r improver.Request, onChunk func(string)) error {
		got = r
		onChunk("  \"Olá")
		onChunk(" mundo\"  ")
		return nil
	}}
	h := newHarness(t, runner, canSimulate)

	id, err := h.svc.Start(StartRequest{Text: "oi", ActionID: "fix", FreeInstruction: "curto"})
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	if id == "" {
		t.Fatal("Start returned empty id")
	}
	done := h.em.waitFor(t, isEvent(EventDone, id))
	if d := done.data.(DoneEvent); d.Text != "Olá mundo" {
		t.Fatalf("done text = %q, want cleaned %q", d.Text, "Olá mundo")
	}
	if got != (improver.Request{Text: "oi", ActionID: "fix", FreeInstruction: "curto"}) {
		t.Fatalf("runner got %+v", got)
	}

	var names []string
	for _, ev := range h.em.snapshot() {
		if eventID(ev) != id {
			t.Fatalf("event with foreign id: %+v", ev)
		}
		names = append(names, ev.name)
	}
	want := []string{EventChunk, EventChunk, EventDone}
	if strings.Join(names, ",") != strings.Join(want, ",") {
		t.Fatalf("events = %v, want %v", names, want)
	}
	if c := h.em.snapshot()[0].data.(ChunkEvent); c.Delta != "  \"Olá" {
		t.Fatalf("first delta = %q", c.Delta)
	}
}

// blockingRunner emits "a", then blocks until ctx is cancelled, then tries
// to emit a late chunk (the service must drop it) and returns ctx.Err().
func blockingRunner(started chan<- string) Runner {
	return fakeRunner{run: func(ctx context.Context, r improver.Request, onChunk func(string)) error {
		onChunk("a")
		started <- r.Text
		<-ctx.Done()
		onChunk("late")
		return ctx.Err()
	}}
}

func TestSecondStartCancelsFirst(t *testing.T) {
	started := make(chan string, 2)
	var calls int
	var mu sync.Mutex
	block := blockingRunner(started)
	runner := fakeRunner{run: func(ctx context.Context, r improver.Request, onChunk func(string)) error {
		mu.Lock()
		calls++
		n := calls
		mu.Unlock()
		if n == 1 {
			return block.Run(ctx, r, onChunk)
		}
		onChunk("b")
		return nil
	}}
	h := newHarness(t, runner, canSimulate)

	id1, _ := h.svc.Start(StartRequest{Text: "one", ActionID: "fix"})
	<-started
	id2, _ := h.svc.Start(StartRequest{Text: "two", ActionID: "fix"})
	if id1 == id2 {
		t.Fatal("ids must differ")
	}
	h.em.waitFor(t, isEvent(EventDone, id2))
	time.Sleep(20 * time.Millisecond) // give the first goroutine time to finish

	var first []string
	for _, ev := range h.em.snapshot() {
		if eventID(ev) == id1 {
			first = append(first, ev.name+":"+fmt.Sprint(ev.data))
		}
	}
	if len(first) != 1 || !strings.HasPrefix(first[0], EventChunk) {
		t.Fatalf("first request events = %v, want only the initial chunk", first)
	}
}

func TestCancelStopsRequestWithoutFurtherEvents(t *testing.T) {
	started := make(chan string, 1)
	finished := make(chan struct{})
	block := blockingRunner(started)
	runner := fakeRunner{run: func(ctx context.Context, r improver.Request, onChunk func(string)) error {
		defer close(finished)
		return block.Run(ctx, r, onChunk)
	}}
	h := newHarness(t, runner, canSimulate)

	id, _ := h.svc.Start(StartRequest{Text: "x", ActionID: "fix"})
	<-started
	h.svc.Cancel(id)
	select {
	case <-finished:
	case <-time.After(2 * time.Second):
		t.Fatal("runner not cancelled")
	}
	time.Sleep(10 * time.Millisecond)
	evs := h.em.snapshot()
	if len(evs) != 1 || evs[0].name != EventChunk {
		t.Fatalf("events after cancel = %+v, want only the first chunk", evs)
	}
}

func TestCancelWithUnknownIDIsNoop(t *testing.T) {
	started := make(chan string, 1)
	h := newHarness(t, blockingRunner(started), canSimulate)
	id, _ := h.svc.Start(StartRequest{Text: "x", ActionID: "fix"})
	<-started
	h.svc.Cancel("other")
	h.svc.Cancel(id) // cleanup
}

func TestCloseCancelsInFlightAndHidesWindow(t *testing.T) {
	started := make(chan string, 1)
	finished := make(chan struct{})
	block := blockingRunner(started)
	runner := fakeRunner{run: func(ctx context.Context, r improver.Request, onChunk func(string)) error {
		defer close(finished)
		return block.Run(ctx, r, onChunk)
	}}
	h := newHarness(t, runner, canSimulate)

	h.svc.Start(StartRequest{Text: "x", ActionID: "fix"})
	<-started
	h.svc.Close()
	select {
	case <-finished:
	case <-time.After(2 * time.Second):
		t.Fatal("Close did not cancel the request")
	}
	if log := h.rec.snapshot(); len(log) != 1 || log[0] != "hide" {
		t.Fatalf("side effects = %v, want [hide]", log)
	}
	time.Sleep(10 * time.Millisecond)
	for _, ev := range h.em.snapshot() {
		if ev.name != EventChunk {
			t.Fatalf("unexpected event after Close: %+v", ev)
		}
	}
}

// ---- error mapping ---------------------------------------------------------

func TestRunnerErrorsBecomePTBRErrorEvents(t *testing.T) {
	cfg := config.Default()
	cases := []struct {
		name string
		err  error
		want string
	}{
		{"unreachable", fmt.Errorf("wrap: %w", llm.ErrUnreachable),
			"Não foi possível conectar em " + cfg.Provider.BaseURL + ". O Ollama está rodando? (ollama serve)"},
		{"401", &llm.APIError{Status: 401, Message: "invalid key"}, "invalid key — verifique a api_key"},
		{"403", &llm.APIError{Status: 403, Message: "forbidden"}, "forbidden — verifique a api_key"},
		{"404", &llm.APIError{Status: 404, Message: "model not found"}, "model not found — verifique o model"},
		{"500", &llm.APIError{Status: 500, Message: "boom"}, "boom"},
		{"deadline", context.DeadlineExceeded, "Tempo esgotado aguardando o modelo. Tente novamente."},
		{"too long", improver.ErrTooLong, fmt.Sprintf("Texto muito longo (máximo de %d caracteres).", cfg.MaxInputChars)},
		{"empty", improver.ErrEmptyText, "O texto está vazio. Selecione ou digite um texto."},
		{"no instruction", improver.ErrNoInstruction, "Escolha uma ação ou escreva uma instrução."},
		{"unknown action", improver.ErrUnknownAction, "Ação desconhecida. Recarregue a configuração."},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			runner := fakeRunner{run: func(context.Context, improver.Request, func(string)) error { return tc.err }}
			h := newHarness(t, runner, canSimulate)
			id, _ := h.svc.Start(StartRequest{Text: "x", ActionID: "fix"})
			ev := h.em.waitFor(t, isEvent(EventError, id))
			if msg := ev.data.(ErrorEvent).Message; msg != tc.want {
				t.Fatalf("message = %q, want %q", msg, tc.want)
			}
		})
	}
}

func TestRunnerCanceledErrorEmitsNothing(t *testing.T) {
	returned := make(chan struct{})
	runner := fakeRunner{run: func(context.Context, improver.Request, func(string)) error {
		defer close(returned)
		return context.Canceled
	}}
	h := newHarness(t, runner, canSimulate)
	h.svc.Start(StartRequest{Text: "x", ActionID: "fix"})
	<-returned
	time.Sleep(10 * time.Millisecond)
	if evs := h.em.snapshot(); len(evs) != 0 {
		t.Fatalf("events = %+v, want none", evs)
	}
}

// ---- Replace / Copy --------------------------------------------------------

func TestReplaceWithoutCanReplaceReturnsErrorAndDoesNotPaste(t *testing.T) {
	h := newHarness(t, fakeRunner{}, platform.Session{CanSimulateKeys: false, Reason: "wayland"})
	if err := h.svc.Replace("novo"); err == nil {
		t.Fatal("Replace should fail when canReplace=false")
	}
	if log := h.rec.snapshot(); len(log) != 0 {
		t.Fatalf("side effects = %v, want none", log)
	}
	if txt, _ := h.cb.Text(); txt != "" {
		t.Fatalf("clipboard touched: %q", txt)
	}
}

func TestReplaceHidesWindowThenPastesAndRestoresClipboard(t *testing.T) {
	h := newHarness(t, fakeRunner{}, canSimulate)
	h.cb.SetText("original")
	if err := h.svc.Replace("novo texto"); err != nil {
		t.Fatalf("Replace: %v", err)
	}
	want := []string{"hide", "release-focus", "sleep:150ms", "paste:novo texto"}
	if got := h.rec.snapshot(); strings.Join(got, "|") != strings.Join(want, "|") {
		t.Fatalf("side effects = %v, want %v", got, want)
	}
	if txt, _ := h.cb.Text(); txt != "original" {
		t.Fatalf("clipboard = %q, want restored %q", txt, "original")
	}
}

func TestReplaceEmptyTextFails(t *testing.T) {
	h := newHarness(t, fakeRunner{}, canSimulate)
	if err := h.svc.Replace("   "); err == nil {
		t.Fatal("Replace with empty text should fail")
	}
	if log := h.rec.snapshot(); len(log) != 0 {
		t.Fatalf("side effects = %v, want none", log)
	}
}

func TestCopySetsClipboardOnly(t *testing.T) {
	h := newHarness(t, fakeRunner{}, canSimulate)
	if err := h.svc.Copy("copiado"); err != nil {
		t.Fatalf("Copy: %v", err)
	}
	if txt, _ := h.cb.Text(); txt != "copiado" {
		t.Fatalf("clipboard = %q", txt)
	}
	if log := h.rec.snapshot(); len(log) != 0 {
		t.Fatalf("side effects = %v, want none", log)
	}
}

// ---- GetState --------------------------------------------------------------

func TestGetStateExposesActionsAndSession(t *testing.T) {
	h := newHarness(t, fakeRunner{}, platform.Session{CanSimulateKeys: false, Reason: "sem xdotool"})
	st := h.svc.GetState()
	cfg := config.Default()
	if len(st.Actions) != len(cfg.Actions) {
		t.Fatalf("actions = %d, want %d", len(st.Actions), len(cfg.Actions))
	}
	a := cfg.Actions[0]
	if st.Actions[0] != (ActionDTO{ID: a.ID, Category: a.Category, Label: a.Label}) {
		t.Fatalf("action[0] = %+v", st.Actions[0])
	}
	if st.CanReplace || st.Warning != "sem xdotool" || st.Error != "" {
		t.Fatalf("state = %+v", st)
	}
}

func TestHostErrorAndHotkeyWarningAreReflectedInState(t *testing.T) {
	h := newHarness(t, fakeRunner{}, platform.Session{CanSimulateKeys: false, Reason: "motivo"})
	h.host.SetError("config ruim")
	h.host.SetHotkeyWarning("atalho em uso")
	st := h.svc.GetState()
	if st.Error != "config ruim" {
		t.Fatalf("error = %q", st.Error)
	}
	if st.Warning != "motivo atalho em uso" {
		t.Fatalf("warning = %q", st.Warning)
	}
	ev := h.em.waitFor(t, func(ev event) bool { return ev.name == EventState })
	if _, ok := ev.data.(State); !ok {
		t.Fatalf("state event payload = %T", ev.data)
	}
}

func TestConfigureSwapsRunnerAndActionsAndClearsError(t *testing.T) {
	h := newHarness(t, fakeRunner{}, canSimulate)
	h.host.SetError("velho")
	cfg := config.Default()
	cfg.Actions = cfg.Actions[:1]
	h.host.Configure(cfg, fakeRunner{run: func(_ context.Context, _ improver.Request, on func(string)) error {
		on("novo")
		return nil
	}})
	if st := h.svc.GetState(); len(st.Actions) != 1 || st.Error != "" {
		t.Fatalf("state = %+v", st)
	}
	id, _ := h.svc.Start(StartRequest{Text: "x", ActionID: cfg.Actions[0].ID})
	if d := h.em.waitFor(t, isEvent(EventDone, id)).data.(DoneEvent); d.Text != "novo" {
		t.Fatalf("done = %q", d.Text)
	}
}

// ---- hotkey flow -----------------------------------------------------------

func selectionEvents(em *fakeEmitter) []SelectionEvent {
	var out []SelectionEvent
	for _, ev := range em.snapshot() {
		if ev.name == EventSelection {
			out = append(out, ev.data.(SelectionEvent))
		}
	}
	return out
}

func TestTriggerCapturesSelectionRestoresClipboardThenShowsWindow(t *testing.T) {
	h := newHarness(t, fakeRunner{}, canSimulate)
	h.cb.SetText("antes")
	h.keys.selection = "texto selecionado"

	h.host.Trigger()

	if log := h.rec.snapshot(); strings.Join(log, "|") != "copy|show" {
		t.Fatalf("side effects = %v, want copy before show", log)
	}
	if txt, _ := h.cb.Text(); txt != "antes" {
		t.Fatalf("clipboard = %q, want restored", txt)
	}
	sel := selectionEvents(h.em)
	if len(sel) != 1 || sel[0] != (SelectionEvent{Text: "texto selecionado", CanReplace: true}) {
		t.Fatalf("selection events = %+v", sel)
	}
	if st := h.svc.GetState(); st.Text != "texto selecionado" || !st.CanReplace {
		t.Fatalf("state = %+v", st)
	}
}

func TestTriggerWithoutSelectionOpensEmpty(t *testing.T) {
	h := newHarness(t, fakeRunner{}, canSimulate)
	h.cb.SetText("antes")

	h.host.Trigger()

	sel := selectionEvents(h.em)
	if len(sel) != 1 || sel[0].Text != "" {
		t.Fatalf("selection events = %+v, want one with empty text", sel)
	}
	if log := h.rec.snapshot(); strings.Join(log, "|") != "copy|show" {
		t.Fatalf("side effects = %v", log)
	}
	if txt, _ := h.cb.Text(); txt != "antes" {
		t.Fatalf("clipboard = %q, want restored", txt)
	}
}

func TestTriggerReadsClipboardWhenKeysCannotBeSimulated(t *testing.T) {
	h := newHarness(t, fakeRunner{}, platform.Session{CanSimulateKeys: false, Reason: "wayland"})
	h.cb.SetText("copiado manualmente")
	h.keys.selection = "nunca usado"

	h.host.Trigger()

	if log := h.rec.snapshot(); strings.Join(log, "|") != "show" {
		t.Fatalf("side effects = %v, want only show (no copy)", log)
	}
	sel := selectionEvents(h.em)
	want := SelectionEvent{Text: "copiado manualmente", CanReplace: false, Warning: "wayland"}
	if len(sel) != 1 || sel[0] != want {
		t.Fatalf("selection events = %+v, want %+v", sel, want)
	}
}

func TestTriggerCancelsInFlightRequest(t *testing.T) {
	started := make(chan string, 1)
	finished := make(chan struct{})
	block := blockingRunner(started)
	runner := fakeRunner{run: func(ctx context.Context, r improver.Request, onChunk func(string)) error {
		defer close(finished)
		return block.Run(ctx, r, onChunk)
	}}
	h := newHarness(t, runner, platform.Session{})
	h.svc.Start(StartRequest{Text: "x", ActionID: "fix"})
	<-started
	h.host.Trigger()
	select {
	case <-finished:
	case <-time.After(2 * time.Second):
		t.Fatal("Trigger did not cancel the in-flight request")
	}
}

func TestShowWindowOnlyShows(t *testing.T) {
	h := newHarness(t, fakeRunner{}, canSimulate)
	h.host.ShowWindow()
	if log := h.rec.snapshot(); strings.Join(log, "|") != "show" {
		t.Fatalf("side effects = %v", log)
	}
}

func TestSetSessionUpdatesCanReplace(t *testing.T) {
	h := newHarness(t, fakeRunner{}, canSimulate)
	h.host.SetSession(platform.Session{CanSimulateKeys: false, Reason: "sem permissão"})
	if err := h.svc.Replace("x"); err == nil {
		t.Fatal("Replace should fail after session lost key simulation")
	}
	if st := h.svc.GetState(); st.CanReplace || st.Warning != "sem permissão" {
		t.Fatalf("state = %+v", st)
	}
}
