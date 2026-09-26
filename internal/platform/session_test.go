package platform

import (
	"errors"
	"strings"
	"testing"
)

func envOf(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func lookPathOK(string) (string, error) { return "/usr/bin/xdotool", nil }

func lookPathMissing(string) (string, error) { return "", errors.New("not found") }

func TestDetectLinuxSession(t *testing.T) {
	tests := []struct {
		name       string
		env        map[string]string
		lookPath   func(string) (string, error)
		wantCan    bool
		wantReason string // substring; "" means Reason must be empty
	}{
		{"wayland via XDG_SESSION_TYPE", map[string]string{"XDG_SESSION_TYPE": "wayland"}, lookPathOK, false, "Wayland"},
		{"wayland via WAYLAND_DISPLAY", map[string]string{"WAYLAND_DISPLAY": "wayland-0", "XDG_SESSION_TYPE": "x11"}, lookPathOK, false, "Wayland"},
		{"x11 with xdotool", map[string]string{"XDG_SESSION_TYPE": "x11", "DISPLAY": ":0"}, lookPathOK, true, ""},
		{"x11 without xdotool", map[string]string{"XDG_SESSION_TYPE": "x11"}, lookPathMissing, false, "xdotool"},
		{"unset session type with xdotool", map[string]string{}, lookPathOK, true, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var looked []string
			lp := func(f string) (string, error) { looked = append(looked, f); return tt.lookPath(f) }
			s := detectLinuxSession(envOf(tt.env), lp)
			if s.CanSimulateKeys != tt.wantCan {
				t.Fatalf("CanSimulateKeys = %v, want %v", s.CanSimulateKeys, tt.wantCan)
			}
			if tt.wantReason == "" && s.Reason != "" {
				t.Fatalf("Reason = %q, want empty", s.Reason)
			}
			if tt.wantReason != "" && !strings.Contains(s.Reason, tt.wantReason) {
				t.Fatalf("Reason = %q, want it to mention %q", s.Reason, tt.wantReason)
			}
			if strings.Contains(tt.name, "wayland") && len(looked) != 0 {
				t.Fatalf("Wayland must be detected before looking up xdotool, looked=%v", looked)
			}
			if !strings.Contains(tt.name, "wayland") && (len(looked) != 1 || looked[0] != "xdotool") {
				t.Fatalf("lookPath calls = %v, want [xdotool]", looked)
			}
		})
	}
}

func TestDetectLinuxSession_MissingXdotoolReasonHasInstallHint(t *testing.T) {
	s := detectLinuxSession(envOf(nil), lookPathMissing)
	if !strings.Contains(s.Reason, "Instale o xdotool") || !strings.Contains(s.Reason, "sudo apt install xdotool") {
		t.Fatalf("Reason = %q", s.Reason)
	}
}
