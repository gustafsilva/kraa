// Package platform captures the user's selection and pastes text back into
// the source app through the system clipboard plus simulated Copy/Paste
// keystrokes. This file is OS-agnostic and must not import Wails; the
// OS-specific pieces live in keys_<goos>.go / session_<goos>.go.
package platform

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"
)

// Clipboard is the minimal text clipboard used by Capture and Paste.
// Text returns ok=false when the clipboard holds no text (empty, image,
// files...). SetText returns false when the write failed.
type Clipboard interface {
	Text() (string, bool)
	SetText(string) bool
}

// KeySender simulates the OS Copy/Paste shortcut in the focused app.
type KeySender interface {
	Copy() error
	Paste() error
}

// Session describes whether keystrokes can be simulated in this session.
// Reason is a PT-BR, user-facing explanation; empty when CanSimulateKeys.
type Session struct {
	CanSimulateKeys bool
	Reason          string
}

// ErrNoSelection means the source app did not put any text in the clipboard
// after the Copy shortcut (nothing selected, or the app ignored it).
var ErrNoSelection = errors.New("nenhum texto selecionado")

// pollInterval is how often Capture checks whether the clipboard changed.
const pollInterval = 20 * time.Millisecond

// Capture copies the current selection of the focused app via the clipboard.
//
// It saves the original clipboard text, writes a unique sentinel, fires
// ks.Copy() and polls every 20ms (up to wait) for a value different from the
// sentinel. restore puts the original text back; it is never nil and is safe
// to call more than once. On ErrNoSelection or a Copy error the clipboard is
// already restored before returning.
//
// Limitation (ruling R9): only text can be saved/restored. If the original
// clipboard was not text (image, files...), the sentinel unavoidably replaces
// it and restore is a no-op; we never call SetText("") to "restore" it.
func Capture(cb Clipboard, ks KeySender, wait time.Duration) (text string, restore func(), err error) {
	restore = saveClipboard(cb)

	sentinel := newSentinel()
	if !cb.SetText(sentinel) {
		restore()
		return "", restore, errors.New("não foi possível escrever na área de transferência")
	}

	if err := ks.Copy(); err != nil {
		restore()
		return "", restore, fmt.Errorf("simular copiar: %w", err)
	}

	deadline := time.Now().Add(wait)
	for {
		if v, ok := cb.Text(); ok && v != sentinel {
			return v, restore, nil
		}
		remaining := time.Until(deadline)
		if remaining <= 0 {
			break
		}
		time.Sleep(min(pollInterval, remaining))
	}

	restore()
	return "", restore, ErrNoSelection
}

// Paste writes text to the clipboard, fires ks.Paste(), waits settle so the
// target app can read the clipboard, then restores the original clipboard
// text (same non-text limitation as Capture). On a Paste error the clipboard
// is restored immediately and the error returned.
func Paste(cb Clipboard, ks KeySender, text string, settle time.Duration) error {
	restore := saveClipboard(cb)

	if !cb.SetText(text) {
		restore()
		return errors.New("não foi possível escrever na área de transferência")
	}
	if err := ks.Paste(); err != nil {
		restore()
		return fmt.Errorf("simular colar: %w", err)
	}
	time.Sleep(settle)
	restore()
	return nil
}

// saveClipboard snapshots the clipboard text and returns a function that
// puts it back. When the clipboard held no text it returns a no-op.
func saveClipboard(cb Clipboard) func() {
	original, ok := cb.Text()
	if !ok {
		return func() {}
	}
	return func() { cb.SetText(original) }
}

// newSentinel returns a value no app will plausibly put in the clipboard.
func newSentinel() string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return fmt.Sprintf("prompt-improve-sentinel-%d", time.Now().UnixNano())
	}
	return "prompt-improve-sentinel-" + hex.EncodeToString(b[:])
}
