package autostart

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"testing"
)

func TestAppBundlePathMapsExecutableToBundle(t *testing.T) {
	got, err := appBundlePath("/Users/ana/Applications/Prompt Improve.app/Contents/MacOS/prompt-improve")
	if err != nil {
		t.Fatalf("appBundlePath: %v", err)
	}
	if want := "/Users/ana/Applications/Prompt Improve.app"; got != want {
		t.Fatalf("appBundlePath = %q, want %q", got, want)
	}
}

func TestAppBundlePathErrorsOutsideABundle(t *testing.T) {
	if _, err := appBundlePath("/tmp/go-build123/b001/exe/autostart.test"); err == nil {
		t.Fatal("expected an error for a binary outside a .app bundle")
	}
}

// New() resolves real OS paths; on darwin a `go test` binary is never
// inside a .app bundle, so New must fail there (the scenario the tray needs
// to handle by hiding/disabling the item). On windows/linux it must
// succeed.
func TestNewResolvesManagerOrFailsOutsideABundleOnDarwin(t *testing.T) {
	m, err := New()
	if runtime.GOOS == "darwin" {
		if err == nil {
			t.Fatalf("New() = %+v, want an error (test binary is not inside a .app bundle)", m)
		}
		return
	}
	if err != nil {
		t.Fatalf("New() = %v", err)
	}
	if m.goos != runtime.GOOS {
		t.Fatalf("goos = %q, want %q", m.goos, runtime.GOOS)
	}
	if m.exePath == "" {
		t.Fatal("exePath is empty")
	}
}

func TestDarwinEnableWritesPlistDisableRemovesIt(t *testing.T) {
	home := t.TempDir()
	m := &Manager{goos: "darwin", home: home, exePath: "/Users/ana/Applications/Prompt Improve.app"}
	file := filepath.Join(home, "Library", "LaunchAgents", AppID+".plist")

	if enabled, err := m.Enabled(); err != nil || enabled {
		t.Fatalf("Enabled() = %v, %v before Enable", enabled, err)
	}

	if err := m.Enable(); err != nil {
		t.Fatalf("Enable: %v", err)
	}
	data, err := os.ReadFile(file)
	if err != nil {
		t.Fatalf("plist not written: %v", err)
	}
	if got := string(data); got != LaunchAgentPlist(m.exePath) {
		t.Fatalf("plist content = %q, want %q", got, LaunchAgentPlist(m.exePath))
	}

	if enabled, err := m.Enabled(); err != nil || !enabled {
		t.Fatalf("Enabled() = %v, %v after Enable", enabled, err)
	}

	if err := m.Disable(); err != nil {
		t.Fatalf("Disable: %v", err)
	}
	if _, err := os.Stat(file); !os.IsNotExist(err) {
		t.Fatalf("plist still exists after Disable (stat err = %v)", err)
	}
	if err := m.Disable(); err != nil {
		t.Fatalf("Disable twice must be idempotent: %v", err)
	}
}

func TestLinuxEnableWritesDesktopEntryDisableRemovesIt(t *testing.T) {
	home := t.TempDir()
	configDir := filepath.Join(home, ".config")
	exePath := filepath.Join(home, ".local", "share", "prompt-improve", "prompt-improve")
	m := &Manager{goos: "linux", home: home, configDir: configDir, exePath: exePath}
	file := filepath.Join(configDir, "autostart", "prompt-improve.desktop")

	if err := m.Enable(); err != nil {
		t.Fatalf("Enable: %v", err)
	}
	data, err := os.ReadFile(file)
	if err != nil {
		t.Fatalf(".desktop not written: %v", err)
	}
	if got := string(data); got != DesktopEntry(exePath) {
		t.Fatalf(".desktop content = %q, want %q", got, DesktopEntry(exePath))
	}

	if err := m.Disable(); err != nil {
		t.Fatalf("Disable: %v", err)
	}
	if _, err := os.Stat(file); !os.IsNotExist(err) {
		t.Fatalf(".desktop still exists after Disable")
	}
}

func TestWindowsEnableCallsRegAddDisableCallsRegDelete(t *testing.T) {
	var calls [][]string
	registered := false
	exePath := `C:\Users\Ana\AppData\Local\prompt-improve\prompt-improve.exe`
	m := &Manager{
		goos:    "windows",
		exePath: exePath,
		runReg: func(args ...string) ([]byte, error) {
			calls = append(calls, append([]string(nil), args...))
			switch args[0] {
			case "query":
				if !registered {
					return nil, errors.New("exit status 1")
				}
			case "add":
				registered = true
			case "delete":
				registered = false
			}
			return nil, nil
		},
	}

	if enabled, err := m.Enabled(); err != nil || enabled {
		t.Fatalf("Enabled() = %v, %v before Enable", enabled, err)
	}

	if err := m.Enable(); err != nil {
		t.Fatalf("Enable: %v", err)
	}
	if want := RegAddArgs(exePath); !reflect.DeepEqual(calls[len(calls)-1], want) {
		t.Fatalf("reg add args = %v, want %v", calls[len(calls)-1], want)
	}

	if enabled, err := m.Enabled(); err != nil || !enabled {
		t.Fatalf("Enabled() = %v, %v after Enable", enabled, err)
	}

	if err := m.Disable(); err != nil {
		t.Fatalf("Disable: %v", err)
	}
	if want := RegDeleteArgs(); !reflect.DeepEqual(calls[len(calls)-1], want) {
		t.Fatalf("reg delete args = %v, want %v", calls[len(calls)-1], want)
	}

	if enabled, err := m.Enabled(); err != nil || enabled {
		t.Fatalf("Enabled() = %v, %v after Disable", enabled, err)
	}
}

func TestWindowsDisableIsIdempotentWhenRegDeleteFails(t *testing.T) {
	m := &Manager{
		goos: "windows",
		runReg: func(args ...string) ([]byte, error) {
			return nil, errors.New("value does not exist")
		},
	}
	if err := m.Disable(); err != nil {
		t.Fatalf("Disable must swallow reg delete errors (idempotent): %v", err)
	}
}

func TestWindowsEnabledPropagatesUnexpectedErrorAsFalse(t *testing.T) {
	// Enabled() only inspects the exit code (err == nil); it doesn't try to
	// distinguish "not registered" from other reg.exe failures, mirroring
	// the CLI's own check.
	m := &Manager{
		goos: "windows",
		runReg: func(args ...string) ([]byte, error) {
			return nil, errors.New("reg.exe not found")
		},
	}
	enabled, err := m.Enabled()
	if err != nil {
		t.Fatalf("Enabled() error = %v, want nil", err)
	}
	if enabled {
		t.Fatal("Enabled() = true, want false")
	}
}
