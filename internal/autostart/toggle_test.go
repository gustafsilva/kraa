package autostart

import (
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
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
}

func TestToggleEnableFailureResyncsCheckboxFromRealState(t *testing.T) {
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
}

func TestToggleDisableFailureResyncsCheckboxFromRealState(t *testing.T) {
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
}

func TestToggleSurfacesEnabledCheckFailureAndLeavesCheckboxUnchanged(t *testing.T) {
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
}

// TestToggleSerializesConcurrentClicks fires 50 clicks, each genuinely
// concurrent with the next (dispatched while the previous one is still
// inside its critical section, confirmed via fakeManager.started) and
// asserts Enable/Disable never overlap, and the checkbox ends up matching
// the manager's real Enabled() state.
//
// Clicks are handed off one at a time (never more than one waiter queued)
// specifically so click dispatch order and lock-acquisition order match:
// Go's sync.Mutex only guarantees strict ordering between whoever currently
// holds it and the next single arrival, not fairness across a burst of
// simultaneous waiters. That matches real tray usage (a person cannot
// literally click twice in the same instant) and keeps this test
// deterministic rather than dependent on scheduler-specific mutex fairness.
func TestToggleSerializesConcurrentClicks(t *testing.T) {
	mgr := &fakeManager{started: make(chan struct{})}
	box := &fakeCheckbox{}
	toggler := NewToggler(mgr)

	const clicks = 50
	var wg sync.WaitGroup
	want := false
	for i := 0; i < clicks; i++ {
		want = !want
		gen := toggler.NextGeneration()

		wg.Add(1)
		go func(want bool, gen uint64) {
			defer wg.Done()
			toggler.Toggle(want, gen, box, func(string) {})
		}(want, gen)

		<-mgr.started // wait for this click to enter its critical section
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
		t.Fatalf("checkbox = %v, want it resynced to Enabled() = %v", got, enabled)
	}
}

// TestToggleAppliesInClickOrderAndSkipsStaleResync is the deterministic
// interleaving regression test for ruling R20: click 1 turns autostart on
// and gets stuck inside Enable; while it's stuck, click 2 turns it off and
// queues up waiting for the lock. Releasing click 1 must NOT let it clobber
// the checkbox with a stale "on" once click 2 (the user's actual last
// intent) has run — click 1 must recognize it's no longer the latest
// generation and skip its own resync entirely.
func TestToggleAppliesInClickOrderAndSkipsStaleResync(t *testing.T) {
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
}
