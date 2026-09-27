//go:build !windows

package config

import (
	"os"
	"path/filepath"
	"strings"
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

func TestLoad_CannotCreateDefaultFile(t *testing.T) {
	// NOTA: o cenário original do brief (diretório pai substituído por um
	// arquivo) faz os.ReadFile falhar com ENOTDIR, não ENOENT — e
	// os.IsNotExist(ENOTDIR) é false no Go, então o código nunca chega em
	// writeDefaultFile; cai em "não foi possível ler" (config.go:97-99).
	// Para exercitar de fato o caminho de "não foi possível criar" (o
	// arquivo não existe, mas o diretório não permite criação) usamos um
	// diretório existente e somente leitura.
	if os.Geteuid() == 0 {
		t.Skip("root ignora permissões")
	}
	dir := t.TempDir()
	if err := os.Chmod(dir, 0o500); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := os.Chmod(dir, 0o700); err != nil {
			t.Fatal(err)
		}
	})
	_, err := Load(filepath.Join(dir, "config.yaml"))
	if err == nil || !strings.Contains(err.Error(), "não foi possível criar") {
		t.Fatalf("err = %v", err)
	}
}

func TestSaveModel_FailsWhenDirIsReadOnly(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("root ignora permissões")
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	if _, err := Load(path); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(dir, 0o500); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := os.Chmod(dir, 0o700); err != nil {
			t.Fatal(err)
		}
	})
	if err := SaveModel(path, "x"); err == nil {
		t.Fatal("esperava erro ao gravar em diretório somente leitura")
	}
}
