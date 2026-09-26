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
// wails/v3 pkg/application/menuitem.go's handleClick), and it flips the
// checkbox's checked state synchronously *before* spawning that goroutine.
// Two quick clicks would otherwise run Enable and Disable concurrently and
// leave the on-disk/registry state out of sync with the checkbox.
//
// Toggler's mutex makes each click's Enable/Disable → resync sequence run
// one at a time, applying operations in click order. want and gen must be
// captured by the caller synchronously in the OnClick callback (via
// NextGeneration, before the goroutine that calls Toggle even blocks on the
// lock) — reading them from the checkbox live, inside Toggle after the lock
// is acquired, would lose a click's intent: e.g. click 1 (on) is running
// Enable, click 2 (off) flips the box, click 1's resync sets the box back
// to on, and click 2 — reading the box instead of its own captured intent —
// would then (wrongly) call Enable again, silently dropping the "off".
// Passing want explicitly avoids that. gen additionally guards the
// checkbox resync: after a click's operation finishes, it only resyncs the
// checkbox from Enabled() if no newer click has been dispatched meanwhile
// (its generation is still the latest) — otherwise that newer click's own
// resync, running right after under the same lock, is authoritative.
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
// synchronously in the OnClick callback, before dispatching to Toggle (e.g.
// before spawning a goroutine that will block on the lock), so concurrent
// clicks are stamped in the order they were actually clicked.
func (t *Toggler) NextGeneration() uint64 {
	return t.gen.Add(1)
}

// Toggle runs one click's worth of work: want is that click's own captured
// intent (e.g. ctx.IsChecked() read at click time) and gen is the token
// NextGeneration returned for it. onWarn receives a PT-BR message
// describing what went wrong with this click's own operation ("" to clear
// a previous warning); it always gets called exactly once.
func (t *Toggler) Toggle(want bool, gen uint64, box Checkbox, onWarn func(string)) {
	t.mu.Lock()
	defer t.mu.Unlock()

	var opErr error
	if want {
		opErr = t.mgr.Enable()
	} else {
		opErr = t.mgr.Disable()
	}

	// Resync the checkbox from the authoritative state, but only if this
	// click is still the latest one dispatched: if a newer click landed
	// while this one was running (or waiting for the lock), that newer
	// click will run its own resync right after this one releases the
	// lock, and that is the state that should stick.
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
