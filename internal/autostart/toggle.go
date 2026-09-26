package autostart

import (
	"fmt"
	"sync"
	"sync/atomic"
)

// Checkbox abstracts the tray checkbox item enough for Toggler to work
// without importing Wails (forbidden in this package): set whether it's
// checked. main.go wraps its *application.MenuItem in a tiny adapter that
// satisfies this interface.
type Checkbox interface {
	SetChecked(checked bool)
}

// autostarter is the subset of *Manager Toggler needs. Defined as an
// interface so tests can inject a fake instead of touching real files/the
// registry. *Manager satisfies it.
type autostarter interface {
	Enabled() (bool, error)
	Enable() error
	Disable() error
}

// Toggler serializes clicks on the "Iniciar com o sistema" checkbox.
//
// Wails runs every menu item's OnClick callback in its own goroutine (see
// wails/v3 pkg/application/menuitem.go's handleClick). NextGeneration is
// called from within that already-running callback goroutine, not
// synchronously by handleClick before spawning it — so there is a small,
// unavoidable window between one click's callback starting and its call to
// NextGeneration, during which another click's callback could run ahead of
// it and allocate a higher generation first. Combined with the fact that
// sync.Mutex does not guarantee FIFO ordering among waiters, a numerically
// lower generation (allocated earlier) can end up acquiring Toggler's lock
// *after* a higher one already ran.
//
// Toggle is built to tolerate that: it checks gen against the latest
// allocated generation both immediately after acquiring the lock and again
// before resyncing the checkbox. A call that's already stale at either
// point stops there — a superseded click never runs Enable/Disable, never
// touches the checkbox, and never calls onWarn once it's known to be stale.
// Only the click holding the numerically highest generation at the time it
// actually runs gets to decide Enable vs. Disable and the checkbox's final
// value, so disk/registry state and the checkbox always end up mutually
// consistent — the residual microsecond-scale reordering window described
// above still exists, but it no longer matters, since whichever click ends
// up with the highest generation always wins, deterministically.
//
// want must be the caller's own captured intent (e.g. ctx.IsChecked() read
// at click time), never re-derived from the checkbox inside Toggle: reading
// the checkbox live, after the lock is acquired, would lose a click's
// intent (e.g. click 1 (on) is running Enable, click 2 (off) flips the box,
// click 1's resync sets the box back to on, and click 2 — reading the box
// instead of its own captured intent — would wrongly call Enable again,
// silently dropping the "off").
type Toggler struct {
	mgr autostarter
	mu  sync.Mutex
	gen atomic.Uint64
}

// NewToggler builds a Toggler around mgr (normally a *Manager from New()).
func NewToggler(mgr autostarter) *Toggler {
	return &Toggler{mgr: mgr}
}

// NextGeneration allocates a fresh generation token for a click. Call it
// once per click, from within the OnClick callback, before calling Toggle.
// See Toggler's doc comment for why this alone doesn't guarantee strict
// click ordering, and why Toggle's own gen checks are what actually keep
// the final state correct.
func (t *Toggler) NextGeneration() uint64 {
	return t.gen.Add(1)
}

// Toggle runs one click's worth of work: want is that click's own captured
// intent (e.g. ctx.IsChecked() read at click time) and gen is the token
// NextGeneration returned for it.
//
// If gen is no longer the latest by the time Toggle acquires the lock, this
// click has already been superseded by a newer one and Toggle returns
// immediately: no Enable/Disable call, no checkbox resync, no onWarn call.
// Otherwise, onWarn receives a PT-BR message describing what went wrong
// with this click's own operation ("" to clear a previous warning); it's
// called exactly once, unless this call turns out to be superseded.
func (t *Toggler) Toggle(want bool, gen uint64, box Checkbox, onWarn func(string)) {
	t.mu.Lock()
	defer t.mu.Unlock()

	if t.gen.Load() != gen {
		// Superseded before we even started: a newer click has already
		// been dispatched. Do nothing at all — not even Enable/Disable —
		// and let that newer click decide the outcome.
		return
	}

	var opErr error
	if want {
		opErr = t.mgr.Enable()
	} else {
		opErr = t.mgr.Disable()
	}

	// Resync the checkbox from the authoritative state, but only if this
	// click is STILL the latest one: a newer click may have been
	// dispatched while this one's Enable/Disable was running, in which
	// case that newer click's own resync (which runs right after this one
	// releases the lock) is authoritative.
	var stateErr error
	if t.gen.Load() == gen {
		var enabled bool
		if enabled, stateErr = t.mgr.Enabled(); stateErr == nil {
			box.SetChecked(enabled)
		}
	}

	switch {
	case opErr != nil:
		verb := "ativar"
		if !want {
			verb = "desativar"
		}
		onWarn(fmt.Sprintf("Não foi possível %s \"Iniciar com o sistema\": %v", verb, opErr))
	case stateErr != nil:
		onWarn(fmt.Sprintf("Não foi possível confirmar o estado de \"Iniciar com o sistema\": %v", stateErr))
	default:
		onWarn("")
	}
}
