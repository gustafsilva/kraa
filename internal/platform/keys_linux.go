//go:build linux

package platform

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// xdotoolTimeout bounds each xdotool run so a stuck X server never hangs us.
const xdotoolTimeout = 2 * time.Second

type linuxKeySender struct{}

// NewKeySender returns a KeySender backed by xdotool (X11 only; callers must
// gate on DetectSession().CanSimulateKeys, which rejects Wayland and a
// missing xdotool).
func NewKeySender() KeySender { return linuxKeySender{} }

func (linuxKeySender) Copy() error  { return xdotoolKey("ctrl+c") }
func (linuxKeySender) Paste() error { return xdotoolKey("ctrl+v") }

func xdotoolKey(combo string) error {
	return xdotoolKeyWith(exec.CommandContext, combo)
}

func xdotoolKeyWith(run func(ctx context.Context, name string, args ...string) *exec.Cmd, combo string) error {
	ctx, cancel := context.WithTimeout(context.Background(), xdotoolTimeout)
	defer cancel()
	// --clearmodifiers releases the hotkey modifiers the user is still
	// holding (e.g. Ctrl+Shift) and restores them afterwards.
	cmd := run(ctx, "xdotool", "key", "--clearmodifiers", combo)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		if msg := strings.TrimSpace(stderr.String()); msg != "" {
			return fmt.Errorf("xdotool key %s: %w: %s", combo, err, msg)
		}
		return fmt.Errorf("xdotool key %s: %w", combo, err)
	}
	return nil
}
