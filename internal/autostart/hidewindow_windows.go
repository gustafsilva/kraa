//go:build windows

package autostart

import (
	"os/exec"
	"syscall"

	"golang.org/x/sys/windows"
)

// hideWindow prevents `reg.exe` from flashing a console window when
// launched from this GUI app. os/exec's SysProcAttr must be the stdlib
// syscall type; windows.CREATE_NO_WINDOW just supplies the flag value.
func hideWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: windows.CREATE_NO_WINDOW,
	}
}
