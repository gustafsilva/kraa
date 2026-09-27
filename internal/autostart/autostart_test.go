package autostart

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
)

func TestAppBundlePathMapsExecutableToBundle(t *testing.T) {
	got, err := appBundlePath("/Users/ana/Applications/Kraa.app/Contents/MacOS/kraa")
	if err != nil {
		t.Fatalf("appBundlePath: %v", err)
	}
	if want := "/Users/ana/Applications/Kraa.app"; got != want {
		t.Fatalf("appBundlePath = %q, want %q", got, want)
	}
}

func TestAppBundlePathErrorsOutsideABundle(t *testing.T) {
	if _, err := appBundlePath("/tmp/go-build123/b001/exe/autostart.test"); err == nil {
		t.Fatal("expected an error for a binary outside a .app bundle")
	}
}

// TestNewManagerPerOS exercises newManager's per-OS branches (darwin bundle
// validation, linux, windows) from fake home/configDir/exe, independent of
// the host OS running the test.
func TestNewManagerPerOS(t *testing.T) {
	cases := []struct {
		name, goos, exe string
		wantErr         string
		wantFile        string // expected m.autostartFile(); empty skips the check (windows doesn't use it)
	}{
		{
			name:     "darwin dentro do .app",
			goos:     "darwin",
			exe:      "/Applications/Kraa.app/Contents/MacOS/kraa",
			wantFile: "/home/u/Library/LaunchAgents/" + AppID + ".plist",
		},
		{
			name:    "darwin fora do .app",
			goos:    "darwin",
			exe:     "/tmp/kraa",
			wantErr: "não está dentro de um pacote .app",
		},
		{
			name:     "linux",
			goos:     "linux",
			exe:      "/home/u/.local/share/kraa/kraa",
			wantFile: "/home/u/.config/autostart/" + BinName + ".desktop",
		},
		{
			name: "windows",
			goos: "windows",
			exe:  `C:\Users\u\AppData\Local\kraa\kraa.exe`,
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			m, err := newManager(c.goos, "/home/u", "/home/u/.config", c.exe)
			if c.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), c.wantErr) {
					t.Fatalf("err = %v", err)
				}
				return
			}
			if err != nil || m == nil {
				t.Fatalf("m=%v err=%v", m, err)
			}
			if c.goos == "windows" {
				if m.runReg == nil {
					t.Fatal("runReg is nil")
				}
				return
			}
			if got := m.autostartFile(); got != c.wantFile {
				t.Fatalf("autostartFile() = %q, want %q", got, c.wantFile)
			}
		})
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
	m := &Manager{goos: "darwin", home: home, exePath: "/Users/ana/Applications/Kraa.app"}
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
	exePath := filepath.Join(home, ".local", "share", "kraa", "kraa")
	m := &Manager{goos: "linux", home: home, configDir: configDir, exePath: exePath}
	file := filepath.Join(configDir, "autostart", "kraa.desktop")

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
	exePath := `C:\Users\Ana\AppData\Local\kraa\kraa.exe`
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

func TestWindowsEnabledTreatsNormalNonZeroExitAsNotRegistered(t *testing.T) {
	// A plain non-zero exit (the ordinary "value not found" case) is not
	// registered, and not an error worth surfacing.
	m := &Manager{
		goos: "windows",
		runReg: func(args ...string) ([]byte, error) {
			return nil, errors.New("exit status 1")
		},
	}
	enabled, err := m.Enabled()
	if err != nil {
		t.Fatalf("Enabled() error = %v, want nil for a normal non-zero exit", err)
	}
	if enabled {
		t.Fatal("Enabled() = true, want false")
	}
}

func TestWindowsEnabledPropagatesErrorWhenRegCannotStart(t *testing.T) {
	// *exec.Error means reg.exe itself couldn't be started (missing binary,
	// permissions, ...): that's not "not registered", it's a real failure
	// the caller (main.go) should log.
	m := &Manager{
		goos: "windows",
		runReg: func(args ...string) ([]byte, error) {
			return nil, &exec.Error{Name: "reg", Err: exec.ErrNotFound}
		},
	}
	enabled, err := m.Enabled()
	if err == nil {
		t.Fatal("Enabled() error = nil, want an error when reg.exe can't be started")
	}
	if enabled {
		t.Fatal("Enabled() = true, want false")
	}
}
