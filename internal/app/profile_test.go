package app

import (
	"errors"
	"strings"
	"testing"

	"github.com/gustavofreitas/kraa/internal/config"
)

func TestGetProfileReturnsConfigProfile(t *testing.T) {
	h := newHarness(t, nil, canSimulate)
	cfg := config.Default()
	cfg.Profile = config.Profile{Enabled: true, Text: "Sou dev"}
	h.host.Configure(cfg, nil)

	if got := h.svc.GetProfile(); got != (ProfileDTO{Enabled: true, Text: "Sou dev"}) {
		t.Errorf("GetProfile() = %+v", got)
	}
}

func TestSaveProfileNormalizesAndCallsSaver(t *testing.T) {
	h := newHarness(t, nil, canSimulate)
	var got []config.Profile
	h.host.SetProfileSaver(func(p config.Profile) error { got = append(got, p); return nil })

	if err := h.svc.SaveProfile(ProfileDTO{Enabled: true, Text: "  a\r\nb  \n"}); err != nil {
		t.Fatalf("SaveProfile() error = %v", err)
	}
	want := config.Profile{Enabled: true, Text: "a\nb"}
	if len(got) != 1 || got[0] != want {
		t.Errorf("saver got %+v, want [%+v]", got, want)
	}
}

func TestSaveProfileAllowsDisabledEmpty(t *testing.T) {
	h := newHarness(t, nil, canSimulate)
	called := false
	h.host.SetProfileSaver(func(config.Profile) error { called = true; return nil })

	if err := h.svc.SaveProfile(ProfileDTO{Enabled: false, Text: "  "}); err != nil {
		t.Fatalf("SaveProfile() error = %v", err)
	}
	if !called {
		t.Error("saver not called")
	}
}

func TestSaveProfileRejectsEnabledWithoutText(t *testing.T) {
	h := newHarness(t, nil, canSimulate)
	called := false
	h.host.SetProfileSaver(func(config.Profile) error { called = true; return nil })

	err := h.svc.SaveProfile(ProfileDTO{Enabled: true, Text: " \n "})
	if err == nil || err.Error() != "Escreva o perfil antes de ativá-lo." {
		t.Fatalf("SaveProfile() error = %v", err)
	}
	if called {
		t.Error("saver called for invalid profile")
	}
}

func TestSaveProfileRejectsTooLong(t *testing.T) {
	h := newHarness(t, nil, canSimulate)
	h.host.SetProfileSaver(func(config.Profile) error { return nil })

	err := h.svc.SaveProfile(ProfileDTO{Text: strings.Repeat("é", maxProfileChars+1)})
	if err == nil || err.Error() != "O perfil pode ter no máximo 2000 caracteres." {
		t.Fatalf("SaveProfile() error = %v", err)
	}
	if err := h.svc.SaveProfile(ProfileDTO{Text: strings.Repeat("é", maxProfileChars)}); err != nil {
		t.Fatalf("SaveProfile(at limit) error = %v", err)
	}
}

func TestSaveProfileWrapsSaverError(t *testing.T) {
	h := newHarness(t, nil, canSimulate)
	h.host.SetProfileSaver(func(config.Profile) error { return errors.New("disco cheio") })

	err := h.svc.SaveProfile(ProfileDTO{Text: "x"})
	if err == nil || err.Error() != "Não foi possível salvar o perfil: disco cheio" {
		t.Fatalf("SaveProfile() error = %v", err)
	}
}

func TestSaveProfileWithoutSaverFails(t *testing.T) {
	h := newHarness(t, nil, canSimulate)
	if err := h.svc.SaveProfile(ProfileDTO{Text: "x"}); err == nil {
		t.Fatal("SaveProfile() error = nil, want error")
	}
}

func TestShowProfileEmitsCurrentProfileThenShows(t *testing.T) {
	h := newHarness(t, nil, canSimulate)
	cfg := config.Default()
	cfg.Profile = config.Profile{Enabled: true, Text: "novo"}
	h.host.Configure(cfg, nil)

	h.host.ShowProfile()

	ev := h.em.waitFor(t, func(ev event) bool { return ev.name == EventProfile })
	if ev.data != (ProfileDTO{Enabled: true, Text: "novo"}) {
		t.Errorf("event data = %+v", ev.data)
	}
	if got := h.profileRec.snapshot(); len(got) != 1 || got[0] != "show" {
		t.Errorf("profile window log = %v, want [show]", got)
	}
	if got := h.rec.snapshot(); len(got) != 0 {
		t.Errorf("main window touched: %v", got)
	}
}

func TestCloseProfileHidesOnlyProfileWindow(t *testing.T) {
	h := newHarness(t, nil, canSimulate)

	h.svc.CloseProfile()

	if got := h.profileRec.snapshot(); len(got) != 1 || got[0] != "hide" {
		t.Errorf("profile window log = %v, want [hide]", got)
	}
	if got := h.rec.snapshot(); len(got) != 0 {
		t.Errorf("main window touched: %v", got)
	}
}

func TestProfileWindowOptional(t *testing.T) {
	svc, host := New(Options{Emitter: &fakeEmitter{}})
	host.ShowProfile() // must not panic
	svc.CloseProfile() // must not panic
}
