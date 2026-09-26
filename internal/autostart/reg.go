package autostart

import "os/exec"

// defaultRunReg runs `reg <args>` (only ever exercised on windows) without
// flashing a console window, per hideWindow (windows-only file).
func defaultRunReg(args ...string) ([]byte, error) {
	cmd := exec.Command("reg", args...)
	hideWindow(cmd)
	return cmd.CombinedOutput()
}
