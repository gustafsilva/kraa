package autostart

import (
	"reflect"
	"strings"
	"testing"
)

// Golden strings below are copied verbatim from npm/test/autostart.test.ts
// so the Go and TS sides are checked against the exact same expectations.

func TestLaunchAgentPlistOpensAppOnLogin(t *testing.T) {
	xml := LaunchAgentPlist("/Users/ana/Applications/Kraa.app")
	if !strings.Contains(xml, "<key>Label</key>\n  <string>dev.matrixia.kraa</string>") {
		t.Fatalf("missing Label:\n%s", xml)
	}
	want := "<key>ProgramArguments</key>\n  <array>\n    <string>/usr/bin/open</string>\n" +
		"    <string>-a</string>\n    <string>/Users/ana/Applications/Kraa.app</string>\n  </array>"
	if !strings.Contains(xml, want) {
		t.Fatalf("missing ProgramArguments:\n%s", xml)
	}
	if !strings.Contains(xml, "<key>RunAtLoad</key>\n  <true/>") {
		t.Fatalf("missing RunAtLoad:\n%s", xml)
	}
	if !strings.HasPrefix(xml, `<?xml version="1.0" encoding="UTF-8"?>`) {
		t.Fatalf("bad prefix:\n%s", xml)
	}
}

func TestLaunchAgentPlistEscapesXMLCharacters(t *testing.T) {
	xml := LaunchAgentPlist("/Users/a&b/<x>.app")
	if !strings.Contains(xml, "/Users/a&amp;b/&lt;x&gt;.app") {
		t.Fatalf("not escaped:\n%s", xml)
	}
}

func TestDesktopEntryContent(t *testing.T) {
	got := DesktopEntry("/home/ana/.local/share/kraa/kraa")
	want := strings.Join([]string{
		"[Desktop Entry]",
		"Type=Application",
		"Name=Kraa",
		"Comment=Melhora o texto selecionado via LLM",
		`Exec="/home/ana/.local/share/kraa/kraa"`,
		"Terminal=false",
		"X-GNOME-Autostart-enabled=true",
		"",
	}, "\n")
	if got != want {
		t.Fatalf("got:\n%q\nwant:\n%q", got, want)
	}
}

func TestDesktopEntryEscapesQuotesDollarAndBackslash(t *testing.T) {
	got := DesktopEntry(`/home/a"b/$x\y`)
	want := `Exec="/home/a\"b/\$x\\y"`
	if !strings.Contains(got, want) {
		t.Fatalf("got %q, want it to contain %q", got, want)
	}
}

func TestRegAddAndDeleteArgs(t *testing.T) {
	if RegRunKey != `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` {
		t.Fatalf("RegRunKey = %q", RegRunKey)
	}
	if RegValue != "Kraa" {
		t.Fatalf("RegValue = %q", RegValue)
	}

	got := RegAddArgs(`C:\Users\Ana\AppData\Local\kraa\kraa.exe`)
	want := []string{
		"add",
		RegRunKey,
		"/v",
		"Kraa",
		"/t",
		"REG_SZ",
		"/d",
		`"C:\Users\Ana\AppData\Local\kraa\kraa.exe"`,
		"/f",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("RegAddArgs = %#v, want %#v", got, want)
	}

	gotDel := RegDeleteArgs()
	wantDel := []string{"delete", RegRunKey, "/v", "Kraa", "/f"}
	if !reflect.DeepEqual(gotDel, wantDel) {
		t.Fatalf("RegDeleteArgs = %#v, want %#v", gotDel, wantDel)
	}
}

func TestAutostartPathMatchesTSPlatform(t *testing.T) {
	if got, want := AutostartPath("darwin", "", "/Users/ana"),
		"/Users/ana/Library/LaunchAgents/dev.matrixia.kraa.plist"; got != want {
		t.Fatalf("darwin path = %q, want %q", got, want)
	}
	if got, want := AutostartPath("linux", "/home/ana/.config", "/home/ana"),
		"/home/ana/.config/autostart/kraa.desktop"; got != want {
		t.Fatalf("linux path = %q, want %q", got, want)
	}
	if got, want := AutostartPath("linux", "/xdg", "/home/ana"),
		"/xdg/autostart/kraa.desktop"; got != want {
		t.Fatalf("linux XDG_CONFIG_HOME path = %q, want %q", got, want)
	}
}
