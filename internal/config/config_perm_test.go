//go:build !windows

package config

import (
	"os"
	"path/filepath"
	"testing"
)

// No Windows o Go só mapeia o bit de somente leitura, então os modos Unix
// (0600/0755) não são verificáveis lá.
func TestLoad_CreatesDefaultFileWithPrivatePerms(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "sub", "config.yaml")

	if _, err := Load(path); err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("config file was not created: %v", err)
	}
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Errorf("file perm = %o, want 0600", perm)
	}

	dirInfo, err := os.Stat(filepath.Dir(path))
	if err != nil {
		t.Fatalf("parent dir was not created: %v", err)
	}
	if perm := dirInfo.Mode().Perm(); perm != 0o755 {
		t.Errorf("dir perm = %o, want 0755", perm)
	}
}
