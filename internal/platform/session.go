package platform

// OS-agnostic helper (no build tag) so it is unit-tested on every OS;
// session_linux.go wires it to os.Getenv / exec.LookPath.

const (
	reasonWayland = "A colagem automática não é suportada no Wayland. Use o botão Copiar e cole manualmente."
	reasonXdotool = "Instale o xdotool (sudo apt install xdotool) para colar automaticamente."
)

// detectLinuxSession decides whether keystrokes can be simulated on Linux.
// Wayland is checked first (never simulate there); on X11 xdotool must be in
// PATH.
func detectLinuxSession(getenv func(string) string, lookPath func(string) (string, error)) Session {
	if getenv("XDG_SESSION_TYPE") == "wayland" || getenv("WAYLAND_DISPLAY") != "" {
		return Session{CanSimulateKeys: false, Reason: reasonWayland}
	}
	if _, err := lookPath("xdotool"); err != nil {
		return Session{CanSimulateKeys: false, Reason: reasonXdotool}
	}
	return Session{CanSimulateKeys: true}
}
