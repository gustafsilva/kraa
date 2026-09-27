package autostart

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// Manager drives "Iniciar com o sistema" for the running binary: a
// LaunchAgent plist on darwin, the HKCU Run registry key on windows (via the
// `reg` CLI) and an XDG autostart .desktop file on linux. goos, the resolved
// paths and runReg are fields (not build-tag-gated) so every branch can be
// exercised in tests on any host OS.
type Manager struct {
	goos      string
	home      string
	configDir string
	// exePath is what gets written into the artifact: the .app bundle path
	// on darwin (used with `open -a` in the plist), the executable path
	// elsewhere.
	exePath string
	runReg  func(args ...string) ([]byte, error)
}

// New resolves a Manager for the currently running binary using the real
// HOME/config dir/executable path. On darwin the executable must be inside
// a .app bundle (Contents/MacOS/...); a bare dev binary (e.g. `wails3 dev`
// run from a temp path) makes New fail, since there's no bundle to register
// with `open -a`. Callers should treat that failure as "autostart
// unavailable" and hide/disable the tray item.
func New() (*Manager, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	configDir, err := os.UserConfigDir()
	if err != nil {
		return nil, err
	}
	exePath, err := os.Executable()
	if err != nil {
		return nil, err
	}
	if real, err := filepath.EvalSymlinks(exePath); err == nil {
		exePath = real
	}
	return newManager(runtime.GOOS, home, configDir, exePath)
}

// newManager builds a Manager from already-resolved inputs, without touching
// the real OS/environment: goos instead of runtime.GOOS, and home/configDir/exe
// instead of os.UserHomeDir/os.UserConfigDir/os.Executable. This lets tests
// exercise every OS branch (darwin/linux/windows) from any host.
func newManager(goos, home, configDir, exe string) (*Manager, error) {
	exePath := exe
	if goos == "darwin" {
		appPath, err := appBundlePath(exePath)
		if err != nil {
			return nil, err
		}
		exePath = appPath
	}
	return &Manager{
		goos:      goos,
		home:      home,
		configDir: configDir,
		exePath:   exePath,
		runReg:    defaultRunReg,
	}, nil
}

// appBundlePath maps the running executable's path (…/X.app/Contents/MacOS/…)
// to its enclosing .app bundle: the same bundle the npm installer registers
// with `open -a` / ProgramArguments (npm/src/autostart.ts's
// launchAgentPlist runs exactly that).
func appBundlePath(exePath string) (string, error) {
	const marker = ".app/Contents/MacOS/"
	idx := strings.Index(exePath, marker)
	if idx < 0 {
		return "", &bundleError{exePath}
	}
	return exePath[:idx+len(".app")], nil
}

type bundleError struct{ exePath string }

func (e *bundleError) Error() string {
	return "autostart: executável \"" + e.exePath + "\" não está dentro de um pacote .app"
}

// autostartFile returns the plist (darwin) or .desktop (linux) path for m.
func (m *Manager) autostartFile() string {
	return AutostartPath(m.goos, m.configDir, m.home)
}

// Enabled reports whether autostart is currently on.
func (m *Manager) Enabled() (bool, error) {
	if m.goos == "windows" {
		// The exit code is the signal: `reg query` exits non-zero when the
		// value is absent, which is a normal "not registered" outcome, not
		// an error. But an *exec.Error means reg.exe itself couldn't be
		// started (missing binary, permissions, ...): that's a real failure
		// worth surfacing to the caller instead of silently reporting false.
		_, err := m.runReg("query", RegRunKey, "/v", RegValue)
		if err == nil {
			return true, nil
		}
		var startErr *exec.Error
		if errors.As(err, &startErr) {
			return false, err
		}
		return false, nil
	}
	if _, err := os.Stat(m.autostartFile()); err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

// Enable turns autostart on.
func (m *Manager) Enable() error {
	if m.goos == "windows" {
		_, err := m.runReg(RegAddArgs(m.exePath)...)
		return err
	}
	file := m.autostartFile()
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		return err
	}
	var content string
	if m.goos == "darwin" {
		content = LaunchAgentPlist(m.exePath)
	} else {
		content = DesktopEntry(m.exePath)
	}
	return os.WriteFile(file, []byte(content), 0o644)
}

// Disable turns autostart off. Idempotent: disabling twice (or when it was
// never enabled) is not an error, mirroring npm/src/autostart.ts's
// setAutostart(false, …).
func (m *Manager) Disable() error {
	if m.goos == "windows" {
		// `reg delete` fails when the value doesn't exist; swallow that,
		// exactly like the TS side's `.catch(() => {})`.
		_, _ = m.runReg(RegDeleteArgs()...)
		return nil
	}
	err := os.Remove(m.autostartFile())
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
