package app

import (
	"fmt"
	"os/exec"
	"runtime"
)

// OpenFile opens path with the OS default application (used by the tray
// item "Editar configuração").
func OpenFile(path string) error {
	return openFile(runtime.GOOS, path, func(name string, args ...string) error {
		cmd := exec.Command(name, args...)
		if err := cmd.Start(); err != nil {
			return err
		}
		go func() { _ = cmd.Wait() }() // reap the child
		return nil
	})
}

func openFile(goos, path string, run func(name string, args ...string) error) error {
	name, args := openCommand(goos, path)
	if err := run(name, args...); err != nil {
		return fmt.Errorf("não foi possível abrir %s: %w", path, err)
	}
	return nil
}

// openCommand returns the command that opens path with the default app.
func openCommand(goos, path string) (string, []string) {
	switch goos {
	case "darwin":
		return "open", []string{path}
	case "windows":
		return "rundll32", []string{"url.dll,FileProtocolHandler", path}
	default:
		return "xdg-open", []string{path}
	}
}
