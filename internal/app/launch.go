package app

import (
	"slices"
	"sync/atomic"
)

// TriggerArg makes a second launch run the hotkey flow (manual fallback for
// Wayland/GNOME, where a custom system shortcut runs `kraa --trigger`).
const TriggerArg = "--trigger"

// StartupAction is what to do once the app has started.
type StartupAction int32

const (
	StartupNone StartupAction = iota
	StartupShow
	StartupTrigger
)

// LaunchQueue routes second-instance launches to the handler, queueing the
// first one that arrives before SetHandler so it is replayed by Drain on
// ApplicationStarted. Safe for concurrent use (the SingleInstance callback
// runs on another goroutine).
type LaunchQueue struct {
	handler atomic.Pointer[func(capture bool)]
	pending atomic.Int32
}

func (q *LaunchQueue) SetHandler(fn func(capture bool)) { q.handler.Store(&fn) }

func (q *LaunchQueue) OnSecondInstance(args []string) {
	capture := slices.Contains(args, TriggerArg)
	if fn := q.handler.Load(); fn != nil {
		(*fn)(capture)
		return
	}
	want := StartupShow
	if capture {
		want = StartupTrigger
	}
	q.pending.CompareAndSwap(int32(StartupNone), int32(want))
}

// Drain consumes the queued launch. osArgs are this process's own
// arguments (os.Args[1:]); mustShow forces the window when there is a
// config or hotkey problem the user would otherwise never see.
func (q *LaunchQueue) Drain(osArgs []string, mustShow bool) StartupAction {
	pending := StartupAction(q.pending.Swap(int32(StartupNone)))
	switch {
	case pending == StartupTrigger || slices.Contains(osArgs, TriggerArg):
		return StartupTrigger
	case pending == StartupShow || mustShow:
		return StartupShow
	}
	return StartupNone
}
