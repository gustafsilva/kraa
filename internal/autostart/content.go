// Package autostart implements "Iniciar com o sistema": a LaunchAgent plist
// on macOS, the HKCU Run registry key on Windows and an XDG autostart
// .desktop file on Linux. It must produce byte-identical artifacts to the
// npm CLI's `kraa autostart on|off` (npm/src/autostart.ts and
// npm/src/platform.ts) so the CLI and the tray agree on state. This file
// holds the pure content generators; internal/autostart/autostart.go holds
// the Manager that writes/reads them.
package autostart

import (
	"fmt"
	"strings"
)

// Identifiers shared with npm/src/platform.ts.
const (
	AppID   = "dev.matrixia.kraa"
	AppName = "Kraa"
	BinName = "kraa"

	// RegRunKey and RegValue mirror npm/src/autostart.ts's REG_RUN_KEY/REG_VALUE.
	RegRunKey = `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
	RegValue  = "Kraa"
)

var xmlEscaper = strings.NewReplacer(
	"&", "&amp;",
	"<", "&lt;",
	">", "&gt;",
	`"`, "&quot;",
)

// LaunchAgentPlist returns the LaunchAgent plist content that opens appPath
// (the .app bundle) at login, byte-identical to npm/src/autostart.ts's
// launchAgentPlist(appPath).
func LaunchAgentPlist(appPath string) string {
	return fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>%s</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/open</string>
    <string>-a</string>
    <string>%s</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
`, AppID, xmlEscaper.Replace(appPath))
}

var desktopEscaper = strings.NewReplacer(
	`\`, `\\`,
	`"`, `\"`,
	"`", "\\`",
	"$", "\\$",
)

// desktopQuote quotes arg per the Desktop Entry Specification's Exec key,
// mirroring npm/src/autostart.ts's desktopQuote.
func desktopQuote(arg string) string {
	return `"` + desktopEscaper.Replace(arg) + `"`
}

// DesktopEntry returns the XDG autostart .desktop file content,
// byte-identical to npm/src/autostart.ts's desktopEntry(binPath).
func DesktopEntry(binPath string) string {
	lines := []string{
		"[Desktop Entry]",
		"Type=Application",
		"Name=" + AppName,
		"Comment=Melhora o texto selecionado via LLM",
		"Exec=" + desktopQuote(binPath),
		"Terminal=false",
		"X-GNOME-Autostart-enabled=true",
		"",
	}
	return strings.Join(lines, "\n")
}

// RegAddArgs returns the `reg add` arguments that register exePath under
// RegRunKey, byte-identical to npm/src/autostart.ts's regAddArgs(exePath).
func RegAddArgs(exePath string) []string {
	return []string{"add", RegRunKey, "/v", RegValue, "/t", "REG_SZ", "/d", `"` + exePath + `"`, "/f"}
}

// RegDeleteArgs returns the `reg delete` arguments, byte-identical to
// npm/src/autostart.ts's regDeleteArgs().
func RegDeleteArgs() []string {
	return []string{"delete", RegRunKey, "/v", RegValue, "/f"}
}

// AutostartPath returns the plist path (darwin) or the .desktop path
// (linux/other), mirroring npm/src/autostart.ts's autostartPath. Windows
// has no autostart file (it uses the registry), so this is not used there.
// It always joins with "/" (like path.posix in the TS side), independent of
// the host OS running the tests.
func AutostartPath(goos, configDir, home string) string {
	if goos == "darwin" {
		return posixJoin(home, "Library", "LaunchAgents", AppID+".plist")
	}
	return posixJoin(configDir, "autostart", BinName+".desktop")
}

func posixJoin(elem ...string) string {
	return strings.Join(elem, "/")
}
