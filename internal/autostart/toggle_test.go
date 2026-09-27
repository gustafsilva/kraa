package autostart

import (
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"testing/synctest"
	"time"
)

// fakeCheckbox is a minimal, concurrency-safe Checkbox for tests. It also
// records every SetChecked call (history) so tests can assert not just the
// final state but whether a particular call resynced it at all.
type fakeCheckbox struct {
	mu      sync.Mutex
	checked bool
	history []bool
}

func (c *fakeCheckbox) Checked() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.checked
}

func (c *fakeCheckbox) SetChecked(v bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.checked = v
	c.history = append(c.history, v)
}

func (c *fakeCheckbox) callCount() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.history)
}

// fakeManager is a controllable autostarter. inFlight/overlapped detect
// whether two Enable/Disable calls ever ran concurrently (i.e. whether
// Toggler failed to serialize them).
//
//   - started, if non-nil, receives a value the instant Enable or Disable
//     begins (after Toggler's lock is already held, before any
//     blocking/sleep). Tests use it to confirm a click has genuinely
//     entered its critical section before doing anything else.
//   - enableGate, if non-nil, makes Enable() block on it (after signaling
//     started) instead of the default synthetic 1ms sleep, so a test can
//     hold a click "in flight" for as long as it needs.
type fakeManager struct {
	mu         sync.Mutex
	enabled    bool
	enableErr  error
	disableErr error
	enabledErr error

	inFlight   int32
	overlapped bool

	enableCalls  int32
	disableCalls int32

	started    chan struct{}
	enableGate <-chan struct{}
}

func (f *fakeManager) mark() func() {
	if !atomic.CompareAndSwapInt32(&f.inFlight, 0, 1) {
		f.mu.Lock()
		f.overlapped = true
		f.mu.Unlock()
	}
	return func() { atomic.StoreInt32(&f.inFlight, 0) }
}

func (f *fakeManager) signalStarted() {
	if f.started != nil {
		f.started <- struct{}{}
	}
}

func (f *fakeManager) Enable() error {
	atomic.AddInt32(&f.enableCalls, 1)
	defer f.mark()()
	f.signalStarted()
	if f.enableGate != nil {
		<-f.enableGate
	} else {
		time.Sleep(time.Millisecond)
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.enableErr == nil {
		f.enabled = true
	}
	return f.enableErr
}

func (f *fakeManager) Disable() error {
	atomic.AddInt32(&f.disableCalls, 1)
	defer f.mark()()
	f.signalStarted()
	time.Sleep(time.Millisecond)
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.disableErr == nil {
		f.enabled = false
	}
	return f.disableErr
}

func (f *fakeManager) Enabled() (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.enabled, f.enabledErr
}

func TestToggleEnableSuccessChecksBoxAndClearsWarning(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		mgr := &fakeManager{}
		box := &fakeCheckbox{}
		toggler := NewToggler(mgr)
		warn := "old warning"

		toggler.Toggle(true, toggler.NextGeneration(), box, func(msg string) { warn = msg })

		if !box.Checked() {
			t.Fatal("checkbox should be true (Enable succeeded)")
		}
		if warn != "" {
			t.Fatalf("warn = %q, want cleared", warn)
		}
	})
}

func TestToggleEnableFailureResyncsCheckboxFromRealState(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		mgr := &fakeManager{enableErr: errors.New("boom")}
		box := &fakeCheckbox{checked: true} // Wails already flipped it on click
		toggler := NewToggler(mgr)

		var warn string
		toggler.Toggle(true, toggler.NextGeneration(), box, func(msg string) { warn = msg })

		if box.Checked() {
			t.Fatal("checkbox should be resynced to false: Enable failed, real state stayed off")
		}
		if warn == "" || !strings.Contains(warn, "ativar") {
			t.Fatalf("warn = %q, want a message about ativar", warn)
		}
	})
}

func TestToggleDisableFailureResyncsCheckboxFromRealState(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		mgr := &fakeManager{enabled: true, disableErr: errors.New("boom")}
		box := &fakeCheckbox{checked: false} // Wails already flipped it on click
		toggler := NewToggler(mgr)

		var warn string
		toggler.Toggle(false, toggler.NextGeneration(), box, func(msg string) { warn = msg })

		if !box.Checked() {
			t.Fatal("checkbox should be resynced to true: Disable failed, real state stayed on")
		}
		if warn == "" || !strings.Contains(warn, "desativar") {
			t.Fatalf("warn = %q, want a message about desativar", warn)
		}
	})
}

func TestToggleSurfacesEnabledCheckFailureAndLeavesCheckboxUnchanged(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		mgr := &fakeManager{enabledErr: errors.New("reg.exe not found")}
		box := &fakeCheckbox{checked: true}
		toggler := NewToggler(mgr)

		var warn string
		toggler.Toggle(true, toggler.NextGeneration(), box, func(msg string) { warn = msg })

		if warn == "" {
			t.Fatal("expected a warning when the post-toggle Enabled() check fails")
		}
		if !box.Checked() {
			t.Fatal("checkbox should be left as Wails set it when Enabled() can't confirm state")
		}
	})
}

// TestToggleBurstFinalStateMatchesLastClickByGeneration fires N clicks as a
// true simultaneous burst: no synchronization forces one-at-a-time handoff,
// so goroutines genuinely race for Toggler's lock. sync.Mutex does not
// guarantee FIFO among simultaneous waiters, so a lower generation can
// acquire the lock after a higher one already ran — this test's job is to
// prove that no longer matters (ruling R21): regardless of the actual
// execution order, Enable/Disable never overlap, the checkbox always ends
// up equal to the manager's real Enabled(), and both always equal the want
// of the highest-numbered generation (the last click, by allocation order),
// never some other click's outcome.
//
// An earlier version of this test dispatched clicks one at a time (waiting
// for each to enter its critical section before firing the next), which
// avoided the very reordering this test exists to catch and silently
// turned a real production bug into what looked like scheduler-specific
// flakiness. This version restores true, unsynchronized concurrency.
// NOTA: este teste NÃO usa synctest. As 50 goroutines contendem de verdade
// pelo sync.Mutex interno do Toggler enquanto quem detém o lock chama
// time.Sleep (via fakeManager.Enable/Disable) — e bloqueio em sync.Mutex não
// conta como "durably blocked" para o synctest (ver pkg.go.dev/testing/synctest:
// "locking a sync.Mutex or sync.RWMutex" está explicitamente fora da lista).
// Reproduzido isoladamente: embrulhar este teste em synctest.Test trava para
// sempre, porque o relógio falso nunca avança (nem todas as goroutines do
// bubble ficam "durably blocked" ao mesmo tempo) e o Sleep de quem segura o
// lock nunca retorna, então os demais nunca destravam.
func TestToggleBurstFinalStateMatchesLastClickByGeneration(t *testing.T) {
	mgr := &fakeManager{}
	box := &fakeCheckbox{}
	toggler := NewToggler(mgr)

	const clicks = 50
	var wg sync.WaitGroup
	want := false
	var lastGen uint64
	var lastWant bool
	for i := 0; i < clicks; i++ {
		want = !want
		gen := toggler.NextGeneration() // gens allocated in click order
		lastGen, lastWant = gen, want

		// Mirrors Wails flipping the checkbox synchronously on each click;
		// harmless to the outcome (Toggle never reads it) but keeps this
		// close to what main.go's OnClick actually experiences.
		box.mu.Lock()
		box.checked = !box.checked
		box.mu.Unlock()

		wg.Add(1)
		go func(want bool, gen uint64) {
			defer wg.Done()
			toggler.Toggle(want, gen, box, func(string) {})
		}(want, gen)
	}
	wg.Wait()

	if mgr.overlapped {
		t.Fatal("Enable/Disable ran concurrently; Toggle must serialize them")
	}
	enabled, err := mgr.Enabled()
	if err != nil {
		t.Fatalf("Enabled: %v", err)
	}
	if got := box.Checked(); got != enabled {
		t.Fatalf("checkbox = %v, disk/registry Enabled() = %v; they must always agree", got, enabled)
	}
	if enabled != lastWant {
		t.Fatalf("Enabled() = %v, want %v (the last click by generation, gen=%d)", enabled, lastWant, lastGen)
	}
}

// TestToggleSkipsSupersededClickEntirely is the deterministic, goroutine-free
// regression test for ruling R21. sync.Mutex isn't FIFO: a lower-generation
// click (allocated earlier) can still acquire the lock *after* a higher one
// already ran. Calling Toggle directly in that order — higher generation
// first, lower second — reproduces exactly that outcome without needing any
// synchronization. Before this fix, only the checkbox resync was
// gen-guarded, so the superseded (lower-gen) call still ran its own
// Disable, silently undoing the newer click's Enable on disk while the
// checkbox kept showing the newer (correct) "on" — disk said off, checkbox
// showed checked. The fix must skip the ENTIRE call — no Enable/Disable, no
// resync, no onWarn — the moment it's found to be stale.
func TestToggleSkipsSupersededClickEntirely(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		mgr := &fakeManager{}
		box := &fakeCheckbox{}
		toggler := NewToggler(mgr)

		// g2 (off) and g3 (on) are both already allocated (as if both clicks
		// already happened), but g3 is the one that reaches Toggle first —
		// the exact non-FIFO-mutex interleaving R21 describes.
		g2 := toggler.NextGeneration()
		g3 := toggler.NextGeneration()

		toggler.Toggle(true, g3, box, func(string) {})

		g2Warned := false
		toggler.Toggle(false, g2, box, func(string) { g2Warned = true })

		if enabled, err := mgr.Enabled(); err != nil || !enabled {
			t.Fatalf("Enabled() = %v, %v; want true (g3, the newer click, turned it on)", enabled, err)
		}
		if !box.Checked() {
			t.Fatal("checkbox should be true, matching the newer click (g3)")
		}
		if n := atomic.LoadInt32(&mgr.disableCalls); n != 0 {
			t.Fatalf("Disable was called %d time(s) for the superseded click g2, want 0", n)
		}
		if g2Warned {
			t.Fatal("the superseded click (g2) must not call onWarn at all")
		}
	})
}

// TestToggleAppliesInClickOrderAndSkipsStaleResync is the deterministic
// interleaving regression test for ruling R20: click 1 turns autostart on
// and gets stuck inside Enable; while it's stuck, click 2 turns it off and
// queues up waiting for the lock. Releasing click 1 must NOT let it clobber
// the checkbox with a stale "on" once click 2 (the user's actual last
// intent) has run — click 1 must recognize it's no longer the latest
// generation and skip its own resync entirely.
func TestToggleAppliesInClickOrderAndSkipsStaleResync(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		block := make(chan struct{})
		// started is buffered: click 1's Enable and click 2's Disable both call
		// signalStarted, but this test only actively waits for the first
		// (click 1's); an unbuffered channel would make click 2's send block
		// forever with no matching receive.
		mgr := &fakeManager{enableGate: block, started: make(chan struct{}, 1)}
		box := &fakeCheckbox{}
		toggler := NewToggler(mgr)

		// Click 1: turn on. want/gen captured synchronously, exactly like
		// main.go's OnClick does before spawning the goroutine that calls
		// Toggle (which is where the blocking happens).
		want1, gen1 := true, toggler.NextGeneration()
		g1Done := make(chan struct{})
		go func() {
			defer close(g1Done)
			toggler.Toggle(want1, gen1, box, func(string) {})
		}()

		<-mgr.started // click 1 now holds the lock, blocked inside Enable

		// Click 2: turn off, captured while click 1 is still running/holding
		// the lock, so click 2's own goroutine will genuinely wait on the lock.
		want2, gen2 := false, toggler.NextGeneration()
		g2Done := make(chan struct{})
		go func() {
			defer close(g2Done)
			toggler.Toggle(want2, gen2, box, func(string) {})
		}()

		close(block) // release click 1's Enable
		<-g1Done
		<-g2Done

		enabled, err := mgr.Enabled()
		if err != nil {
			t.Fatalf("Enabled: %v", err)
		}
		if enabled {
			t.Fatal("final Enabled() should be false: click 2 (off) was the last click")
		}
		if box.Checked() {
			t.Fatal("final checkbox should be false")
		}
		// Exactly one SetChecked call total (click 2's): click 1 must have
		// detected it was superseded and skipped its resync entirely, rather
		// than briefly setting the box to true before click 2 corrected it.
		if n := box.callCount(); n != 1 {
			t.Fatalf("checkbox was resynced %d times, want exactly 1 (click 1 must skip its stale resync)", n)
		}
	})
}
