package app

// This is the only file in internal/app that imports Wails: thin adapters
// from the Wails runtime to the service's interfaces, plus event typing.

import (
	"github.com/wailsapp/wails/v3/pkg/application"
)

func init() {
	// Registered so the binding generator emits typed events for the
	// frontend and Emit validates payload types.
	application.RegisterEvent[ChunkEvent](EventChunk)
	application.RegisterEvent[DoneEvent](EventDone)
	application.RegisterEvent[ErrorEvent](EventError)
	application.RegisterEvent[SelectionEvent](EventSelection)
	application.RegisterEvent[State](EventState)
}

// WailsEmitter emits events through app.Event.
type WailsEmitter struct{ App *application.App }

func (e WailsEmitter) Emit(name string, data any) { e.App.Event.Emit(name, data) }

// WailsClipboard adapts app.Clipboard to platform.Clipboard.
type WailsClipboard struct{ App *application.App }

func (c WailsClipboard) Text() (string, bool)     { return c.App.Clipboard.Text() }
func (c WailsClipboard) SetText(text string) bool { return c.App.Clipboard.SetText(text) }

// WailsWindow adapts the modal window to Window.
type WailsWindow struct {
	App    *application.App
	Window *application.WebviewWindow
}

func (w WailsWindow) Show() {
	if hideAppToReleaseFocus {
		// Undo a previous ReleaseFocus (NSApp hide) before showing.
		application.InvokeSync(w.App.Show)
	}
	w.Window.Center()
	w.Window.Show()
	w.Window.Focus()
}

func (w WailsWindow) Hide() { w.Window.Hide() }

func (w WailsWindow) IsVisible() bool { return w.Window.IsVisible() }

func (w WailsWindow) ReleaseFocus() {
	if hideAppToReleaseFocus {
		// App.Hide calls [NSApp hide:] directly; AppKit needs the main thread.
		application.InvokeSync(w.App.Hide)
	}
}
