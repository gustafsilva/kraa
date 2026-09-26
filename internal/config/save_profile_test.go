package config

import (
	"os"
	"runtime"
	"strings"
	"testing"
)

func TestSaveProfile_RoundTripsTricky(t *testing.T) {
	cases := []struct {
		name, in, want string
	}{
		{"vazio", "", ""},
		{"uma linha", "Sou dev sênior fullstack", "Sou dev sênior fullstack"},
		{"várias linhas", "linha 1\nlinha 2", "linha 1\nlinha 2"},
		{"parágrafos", "a\n\nb", "a\n\nb"},
		{"dois pontos e cerquilha", "stack: Go # e React", "stack: Go # e React"},
		{"aspas", "\"duplas\" e 'simples'", "\"duplas\" e 'simples'"},
		{"espaço inicial", "  recuado\nnormal", "  recuado\nnormal"},
		{"espaço final", "fim com espaço ", "fim com espaço "},
		{"crlf no texto", "a\r\nb", "a\nb"},
		{"começa com traço", "- item\n- outro", "- item\n- outro"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			path := writeTemp(t, defaultConfigYAML)
			if err := SaveProfile(path, Profile{Enabled: true, Text: tc.in}); err != nil {
				t.Fatalf("SaveProfile() error = %v", err)
			}
			cfg, err := Load(path)
			if err != nil {
				t.Fatalf("Load() error = %v\n%s", err, readFile(t, path))
			}
			if !cfg.Profile.Enabled || cfg.Profile.Text != tc.want {
				t.Errorf("Profile = %+v, want {true %q}", cfg.Profile, tc.want)
			}
		})
	}
}

func TestSaveProfile_KeepsRestOfDefaultTemplate(t *testing.T) {
	path := writeTemp(t, defaultConfigYAML)

	if err := SaveProfile(path, Profile{Enabled: true, Text: "a\nb"}); err != nil {
		t.Fatal(err)
	}

	got := readFile(t, path)
	head := defaultConfigYAML[:strings.Index(defaultConfigYAML, "profile:\n")]
	tail := defaultConfigYAML[strings.Index(defaultConfigYAML, "\n# actions:"):]
	if !strings.HasPrefix(got, head) {
		t.Errorf("content before profile changed:\n%s", got)
	}
	if !strings.HasSuffix(got, tail) {
		t.Errorf("content after profile changed:\n%s", got)
	}
	cfg, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.Actions) != 8 || cfg.Provider.Model != "llama3.2" {
		t.Errorf("rest of config changed: %d actions, model %q", len(cfg.Actions), cfg.Provider.Model)
	}
}

func TestSaveProfile_ReplacesFlowStyleAndKeepsNextComment(t *testing.T) {
	path := writeTemp(t, "profile: {enabled: false, text: velho}\n\n# ações\nactions: []\n")

	if err := SaveProfile(path, Profile{Enabled: true, Text: "novo"}); err != nil {
		t.Fatal(err)
	}
	want := "profile:\n  enabled: true\n  text: novo\n\n# ações\nactions: []\n"
	if got := readFile(t, path); got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestSaveProfile_AppendsWhenMissing(t *testing.T) {
	path := writeTemp(t, "hotkey: \"X\"\n")

	if err := SaveProfile(path, Profile{Enabled: false, Text: "Sou dev"}); err != nil {
		t.Fatal(err)
	}
	want := "hotkey: \"X\"\n\nprofile:\n  enabled: false\n  text: Sou dev\n"
	if got := readFile(t, path); got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestSaveProfile_PreservesCRLF(t *testing.T) {
	path := writeTemp(t, "hotkey: \"X\"\r\nprofile:\r\n  enabled: false\r\n  text: a\r\n")

	if err := SaveProfile(path, Profile{Enabled: true, Text: "x\ny"}); err != nil {
		t.Fatal(err)
	}
	got := readFile(t, path)
	if strings.Count(got, "\n") != strings.Count(got, "\r\n") {
		t.Errorf("mixed line endings: %q", got)
	}
	if !strings.HasPrefix(got, "hotkey: \"X\"\r\nprofile:\r\n") {
		t.Errorf("got %q", got)
	}
}

func TestSaveProfile_InvalidYAMLLeavesFileUntouched(t *testing.T) {
	const broken = "provider: [unclosed\n"
	path := writeTemp(t, broken)

	if err := SaveProfile(path, Profile{Text: "x"}); err == nil {
		t.Fatal("SaveProfile() error = nil, want error")
	}
	if got := readFile(t, path); got != broken {
		t.Errorf("file changed to %q", got)
	}
}

func TestSaveProfile_KeepsPermissions(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("permissões POSIX")
	}
	path := writeTemp(t, defaultConfigYAML)
	if err := SaveProfile(path, Profile{Text: "x"}); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Errorf("perm = %o, want 600", info.Mode().Perm())
	}
}
