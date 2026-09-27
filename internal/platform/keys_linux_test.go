//go:build linux

package platform

import (
	"context"
	"os/exec"
	"strings"
	"testing"
)

func TestXdotoolKeyPassesClearModifiers(t *testing.T) {
	var gotName string
	var gotArgs []string
	run := func(ctx context.Context, name string, args ...string) *exec.Cmd {
		gotName, gotArgs = name, args
		return exec.CommandContext(ctx, "true")
	}
	if err := xdotoolKeyWith(run, "ctrl+c"); err != nil {
		t.Fatal(err)
	}
	if gotName != "xdotool" || strings.Join(gotArgs, " ") != "key --clearmodifiers ctrl+c" {
		t.Fatalf("%s %v", gotName, gotArgs)
	}
}

func TestXdotoolKeyErrorIncludesStderr(t *testing.T) {
	run := func(ctx context.Context, _ string, _ ...string) *exec.Cmd {
		return exec.CommandContext(ctx, "sh", "-c", "echo 'Can not open display' >&2; exit 1")
	}
	err := xdotoolKeyWith(run, "ctrl+v")
	if err == nil || !strings.Contains(err.Error(), "xdotool key ctrl+v") || !strings.Contains(err.Error(), "Can not open display") {
		t.Fatalf("err = %v", err)
	}
}

func TestXdotoolKeyErrorWithoutStderr(t *testing.T) {
	run := func(ctx context.Context, _ string, _ ...string) *exec.Cmd {
		return exec.CommandContext(ctx, "false")
	}
	err := xdotoolKeyWith(run, "ctrl+v")
	if err == nil || strings.HasSuffix(err.Error(), ": ") {
		t.Fatalf("err = %v", err)
	}
}
