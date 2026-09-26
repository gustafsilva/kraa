//go:build !windows

package autostart

import "os/exec"

// hideWindow is a no-op outside windows: `reg` is never invoked there.
func hideWindow(*exec.Cmd) {}
