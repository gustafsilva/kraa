package autostart

import (
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// fakeCheckbox is a minimal, concurrency-safe Checkbox for tests.
type fakeCheckbox struct {
	mu      sync.Mutex
	checked bool
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
}

// fakeManager is a controllable autostarter. inFlight/overlapped detect
// whether two Enable/Disable calls ever ran concurrently.
type fakeManager struct {
	mu         sync.Mutex
	enabled    bool
	enableErr  error
	disableErr error
	enabledErr error

	inFlight   int32
	overlapped bool
}

func (f *fakeManager) mark() func() {
	if !atomic.CompareAndSwapInt32(&f.inFlight, 0, 1) {
		f.mu.Lock()
		f.overlapped = true
		f.mu.Unlock()
	}
	return func() { atomic.StoreInt32(&f.inFlight, 0) }
}

func (f *fakeManager) Enable() error {
	defer f.mark()()
	time.Sleep(time.Millisecond)
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.enableErr == nil {
		f.enabled = true
	}
	return f.enableErr
}

func (f *fakeManager) Disable() error {
	defer f.mark()()
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
	box := &fakeCheckbox{checked: true} // Wails already flipped it on click
	warn := "old warning"

	NewToggler(mgr).Toggle(box, func(msg string) { warn = msg })

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

	var warn string
	NewToggler(mgr).Toggle(box, func(msg string) { warn = msg })

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

	var warn string
	NewToggler(mgr).Toggle(box, func(msg string) { warn = msg })

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

	var warn string
	NewToggler(mgr).Toggle(box, func(msg string) { warn = msg })

	if warn == "" {
		t.Fatal("expected a warning when the post-toggle Enabled() check fails")
	}
	if !box.Checked() {
		t.Fatal("checkbox should be left as Wails set it when Enabled() can't confirm state")
	}
}

// TestToggleSerializesConcurrentClicks fires many clicks concurrently (each
// synchronously flipping the checkbox first, then calling Toggle in its own
// goroutine, mirroring Wails' handleClick) and asserts: Enable/Disable never
// overlap, and once every click has been processed the checkbox exactly
// matches the manager's real Enabled() state.
func TestToggleSerializesConcurrentClicks(t *testing.T) {
	mgr := &fakeManager{}
	box := &fakeCheckbox{}
	toggler := NewToggler(mgr)

	const clicks = 50
	var wg sync.WaitGroup
	for i := 0; i < clicks; i++ {
		box.mu.Lock()
		box.checked = !box.checked
		box.mu.Unlock()

		wg.Add(1)
		go func() {
			defer wg.Done()
			toggler.Toggle(box, func(string) {})
		}()
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
