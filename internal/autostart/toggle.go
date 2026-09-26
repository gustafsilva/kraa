package autostart

import (
	"fmt"
	"sync"
)

// Checkbox abstracts the tray checkbox item enough for Toggler to work
// without importing Wails (forbidden in this package): read whether it's
// currently checked, and set it. main.go wraps its *application.MenuItem in
// a tiny adapter that satisfies this interface.
type Checkbox interface {
	Checked() bool
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
// leave the on-disk/registry state out of sync with the checkbox. Toggler's
// mutex makes each click's Enable/Disable → resync sequence run one at a
// time, and always finishes by resyncing the checkbox from the manager's
// real Enabled() state, so the UI reflects reality even when a click's
// operation failed or was superseded by a later click.
type Toggler struct {
	mgr autostarter
	mu  sync.Mutex
}

// NewToggler builds a Toggler around mgr (normally a *Manager from New()).
func NewToggler(mgr autostarter) *Toggler {
	return &Toggler{mgr: mgr}
}

// Toggle runs one click's worth of work. want is read from box *after* the
// lock is acquired (not captured beforehand), so a click that had to wait
// behind others acts on the checkbox's current state rather than a stale
// one. onWarn receives a PT-BR message describing what went wrong ("" to
// clear a previous warning); it always gets called exactly once.
func (t *Toggler) Toggle(box Checkbox, onWarn func(string)) {
	t.mu.Lock()
	defer t.mu.Unlock()

	want := box.Checked()
	var opErr error
	if want {
		opErr = t.mgr.Enable()
	} else {
		opErr = t.mgr.Disable()
	}

	// Always resync from the authoritative state, whether the operation
	// above succeeded, failed, or was made moot by a click that landed
	// while this one waited for the lock.
	enabled, stateErr := t.mgr.Enabled()
	if stateErr == nil {
		box.SetChecked(enabled)
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
