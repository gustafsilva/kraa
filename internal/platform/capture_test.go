package platform_test

import (
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/gustavofreitas/prompt-improve/internal/platform"
)

// fakeClipboard is an in-memory Clipboard. ok=false models a clipboard whose
// current content is not text (image, files, empty).
type fakeClipboard struct {
	mu     sync.Mutex
	text   string
	ok     bool
	writes []string
}

func newTextClipboard(s string) *fakeClipboard { return &fakeClipboard{text: s, ok: true} }

func (c *fakeClipboard) Text() (string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.text, c.ok
}

func (c *fakeClipboard) SetText(s string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.text, c.ok = s, true
	c.writes = append(c.writes, s)
	return true
}

func (c *fakeClipboard) Writes() []string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]string(nil), c.writes...)
}

// fakeKeys simulates the source app: Copy writes `selection` into the
// clipboard (after `delay`, asynchronously, if set); Paste records what the
// clipboard held at that moment.
type fakeKeys struct {
	cb        *fakeClipboard
	selection *string // nil => nothing selected, clipboard untouched
	delay     time.Duration
	copyErr   error
	pasteErr  error

	mu        sync.Mutex
	copies    int
	pastes    int
	pastedVal string
}

func (k *fakeKeys) Copy() error {
	k.mu.Lock()
	k.copies++
	k.mu.Unlock()
	if k.copyErr != nil {
		return k.copyErr
	}
	if k.selection == nil {
		return nil
	}
	sel := *k.selection
	if k.delay > 0 {
		go func() {
			time.Sleep(k.delay)
			k.cb.SetText(sel)
		}()
		return nil
	}
	k.cb.SetText(sel)
	return nil
}

func (k *fakeKeys) Paste() error {
	k.mu.Lock()
	defer k.mu.Unlock()
	k.pastes++
	k.pastedVal, _ = k.cb.Text()
	return k.pasteErr
}

func strPtr(s string) *string { return &s }

func TestCapture_SelectionCapturedAndRestoreBringsOriginalBack(t *testing.T) {
	cb := newTextClipboard("original")
	ks := &fakeKeys{cb: cb, selection: strPtr("texto selecionado")}

	text, restore, err := platform.Capture(cb, ks, 200*time.Millisecond)
	if err != nil {
		t.Fatalf("Capture error: %v", err)
	}
	if text != "texto selecionado" {
		t.Fatalf("text = %q, want %q", text, "texto selecionado")
	}
	if ks.copies != 1 {
		t.Fatalf("Copy called %d times, want 1", ks.copies)
	}
	restore()
	if got, ok := cb.Text(); !ok || got != "original" {
		t.Fatalf("after restore clipboard = %q (ok=%v), want %q", got, ok, "original")
	}
}

func TestCapture_PollsUntilAppWritesClipboard(t *testing.T) {
	cb := newTextClipboard("original")
	ks := &fakeKeys{cb: cb, selection: strPtr("lento"), delay: 60 * time.Millisecond}

	text, restore, err := platform.Capture(cb, ks, 400*time.Millisecond)
	if err != nil {
		t.Fatalf("Capture error: %v", err)
	}
	if text != "lento" {
		t.Fatalf("text = %q, want %q", text, "lento")
	}
	restore()
	if got, _ := cb.Text(); got != "original" {
		t.Fatalf("after restore clipboard = %q, want original", got)
	}
}

func TestCapture_SelectionEqualToOriginalIsCaptured(t *testing.T) {
	cb := newTextClipboard("mesmo")
	ks := &fakeKeys{cb: cb, selection: strPtr("mesmo")}

	text, _, err := platform.Capture(cb, ks, 100*time.Millisecond)
	if err != nil || text != "mesmo" {
		t.Fatalf("Capture = (%q, %v), want (mesmo, nil)", text, err)
	}
}

// Review Focus 1.
func TestCapture_NoSelectionReturnsErrNoSelectionAndRestores(t *testing.T) {
	cb := newTextClipboard("original")
	ks := &fakeKeys{cb: cb, selection: nil}

	start := time.Now()
	text, restore, err := platform.Capture(cb, ks, 60*time.Millisecond)
	elapsed := time.Since(start)

	if !errors.Is(err, platform.ErrNoSelection) {
		t.Fatalf("err = %v, want ErrNoSelection", err)
	}
	if text != "" {
		t.Fatalf("text = %q, want empty", text)
	}
	if elapsed < 60*time.Millisecond {
		t.Fatalf("returned after %v, should wait the full %v", elapsed, 60*time.Millisecond)
	}
	if got, ok := cb.Text(); !ok || got != "original" {
		t.Fatalf("clipboard = %q (ok=%v), want original restored", got, ok)
	}
	if restore == nil {
		t.Fatal("restore must never be nil")
	}
	restore() // must be safe to call
}

// Review Focus 5 (ruling R9): non-text original is never overwritten with "".
func TestCapture_NonTextOriginalIsNotOverwrittenOnRestore(t *testing.T) {
	cb := &fakeClipboard{ok: false}
	ks := &fakeKeys{cb: cb, selection: strPtr("sel")}

	text, restore, err := platform.Capture(cb, ks, 100*time.Millisecond)
	if err != nil || text != "sel" {
		t.Fatalf("Capture = (%q, %v)", text, err)
	}
	before := len(cb.Writes())
	restore()
	if w := cb.Writes(); len(w) != before {
		t.Fatalf("restore wrote to clipboard %q; must be a no-op for non-text original", w[before:])
	}
	for _, w := range cb.Writes() {
		if w == "" {
			t.Fatal(`SetText("") must never be called`)
		}
	}
}

func TestCapture_NonTextOriginalNoSelectionDoesNotSetEmpty(t *testing.T) {
	cb := &fakeClipboard{ok: false}
	ks := &fakeKeys{cb: cb, selection: nil}

	_, restore, err := platform.Capture(cb, ks, 40*time.Millisecond)
	if !errors.Is(err, platform.ErrNoSelection) {
		t.Fatalf("err = %v, want ErrNoSelection", err)
	}
	restore()
	for _, w := range cb.Writes() {
		if w == "" {
			t.Fatal(`SetText("") must never be called`)
		}
	}
	if len(cb.Writes()) != 1 {
		t.Fatalf("writes = %q, want only the sentinel", cb.Writes())
	}
}

func TestCapture_CopyErrorIsPropagatedAndClipboardRestored(t *testing.T) {
	cb := newTextClipboard("original")
	boom := errors.New("boom")
	ks := &fakeKeys{cb: cb, copyErr: boom}

	_, restore, err := platform.Capture(cb, ks, 100*time.Millisecond)
	if !errors.Is(err, boom) {
		t.Fatalf("err = %v, want wrapping boom", err)
	}
	if errors.Is(err, platform.ErrNoSelection) {
		t.Fatal("Copy error must not be reported as ErrNoSelection")
	}
	if got, _ := cb.Text(); got != "original" {
		t.Fatalf("clipboard = %q, want original restored", got)
	}
	if restore == nil {
		t.Fatal("restore must never be nil")
	}
}

func TestCapture_UsesUniqueSentinel(t *testing.T) {
	cb1 := newTextClipboard("a")
	cb2 := newTextClipboard("a")
	platform.Capture(cb1, &fakeKeys{cb: cb1}, 0)
	platform.Capture(cb2, &fakeKeys{cb: cb2}, 0)
	s1, s2 := cb1.Writes()[0], cb2.Writes()[0]
	if s1 == "" || s1 == "a" || s1 == s2 {
		t.Fatalf("sentinels %q / %q must be non-empty, unique and distinct from original", s1, s2)
	}
}

func TestPaste_WritesTextPastesAndRestoresAfterSettle(t *testing.T) {
	cb := newTextClipboard("original")
	ks := &fakeKeys{cb: cb}

	start := time.Now()
	if err := platform.Paste(cb, ks, "melhorado", 50*time.Millisecond); err != nil {
		t.Fatalf("Paste error: %v", err)
	}
	if elapsed := time.Since(start); elapsed < 50*time.Millisecond {
		t.Fatalf("Paste returned after %v, want >= settle", elapsed)
	}
	if ks.pastes != 1 || ks.pastedVal != "melhorado" {
		t.Fatalf("pastes=%d pastedVal=%q, want 1 / melhorado", ks.pastes, ks.pastedVal)
	}
	if got, _ := cb.Text(); got != "original" {
		t.Fatalf("clipboard = %q, want original restored", got)
	}
}

func TestPaste_NonTextOriginalIsNotOverwrittenWithEmpty(t *testing.T) {
	cb := &fakeClipboard{ok: false}
	ks := &fakeKeys{cb: cb}

	if err := platform.Paste(cb, ks, "melhorado", 0); err != nil {
		t.Fatalf("Paste error: %v", err)
	}
	if w := cb.Writes(); len(w) != 1 || w[0] != "melhorado" {
		t.Fatalf("writes = %q, want only the pasted text", w)
	}
}

func TestPaste_KeySenderErrorIsPropagatedAndClipboardRestored(t *testing.T) {
	cb := newTextClipboard("original")
	boom := errors.New("boom")
	ks := &fakeKeys{cb: cb, pasteErr: boom}

	err := platform.Paste(cb, ks, "melhorado", time.Second)
	if !errors.Is(err, boom) {
		t.Fatalf("err = %v, want wrapping boom", err)
	}
	if got, _ := cb.Text(); got != "original" {
		t.Fatalf("clipboard = %q, want original restored", got)
	}
}
