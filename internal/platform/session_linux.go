//go:build linux

package platform

import (
	"os"
	"os/exec"
)

// DetectSession: Wayland never allows simulated keys; X11 needs xdotool.
func DetectSession() Session { return detectLinuxSession(os.Getenv, exec.LookPath) }
