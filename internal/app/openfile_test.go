package app

import (
	"errors"
	"reflect"
	"testing"
)

func TestOpenCommandPerOS(t *testing.T) {
	const p = "/cfg/config.yaml"
	cases := map[string][]string{
		"darwin":  {"open", p},
		"windows": {"rundll32", "url.dll,FileProtocolHandler", p},
		"linux":   {"xdg-open", p},
		"freebsd": {"xdg-open", p},
	}
	for goos, want := range cases {
		name, args := openCommand(goos, p)
		if got := append([]string{name}, args...); !reflect.DeepEqual(got, want) {
			t.Fatalf("%s: got %v, want %v", goos, got, want)
		}
	}
}

func TestOpenFileRunsCommandAndWrapsError(t *testing.T) {
	var gotName string
	var gotArgs []string
	run := func(name string, args ...string) error {
		gotName, gotArgs = name, args
		return nil
	}
	if err := openFile("linux", "/x.yaml", run); err != nil {
		t.Fatalf("openFile: %v", err)
	}
	if gotName != "xdg-open" || !reflect.DeepEqual(gotArgs, []string{"/x.yaml"}) {
		t.Fatalf("ran %s %v", gotName, gotArgs)
	}

	boom := errors.New("boom")
	err := openFile("darwin", "/x.yaml", func(string, ...string) error { return boom })
	if !errors.Is(err, boom) {
		t.Fatalf("err = %v, want wrapping boom", err)
	}
}
