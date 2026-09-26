package app

import (
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/gustavofreitas/prompt-improve/internal/config"
)

// EventProfile is emitted with the current ProfileDTO right before the
// profile window is shown, so the form discards stale edits.
const EventProfile = "profile:open"

// maxProfileChars caps the profile, which is sent on every request that
// uses it.
const maxProfileChars = 2000

// ProfileDTO is the user profile as exposed to the frontend.
type ProfileDTO struct {
	Enabled bool   `json:"enabled"`
	Text    string `json:"text"`
}

// ProfileSaver persists the profile (config.yaml) and applies it; main.go
// provides it through Host.SetProfileSaver.
type ProfileSaver func(p config.Profile) error

// GetProfile returns the profile of the current configuration.
func (s *ImproveService) GetProfile() ProfileDTO {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.profileLocked()
}

// SaveProfile validates p (enabled requires text; at most maxProfileChars
// after trimming; CRLF becomes LF), persists it and reloads the
// configuration. Errors are PT-BR and user-facing.
func (s *ImproveService) SaveProfile(p ProfileDTO) error {
	text := strings.TrimSpace(strings.ReplaceAll(p.Text, "\r\n", "\n"))
	if p.Enabled && text == "" {
		return errors.New("Escreva o perfil antes de ativá-lo.")
	}
	if utf8.RuneCountInString(text) > maxProfileChars {
		return fmt.Errorf("O perfil pode ter no máximo %d caracteres.", maxProfileChars)
	}
	s.mu.Lock()
	save := s.saveProfile
	s.mu.Unlock()
	if save == nil {
		return errors.New("Não é possível salvar o perfil agora.")
	}
	if err := save(config.Profile{Enabled: p.Enabled, Text: text}); err != nil {
		return fmt.Errorf("Não foi possível salvar o perfil: %w", err)
	}
	return nil
}

// CloseProfile hides the profile window.
func (s *ImproveService) CloseProfile() {
	if s.profileWin != nil {
		s.profileWin.Hide()
	}
}

func (s *ImproveService) profileLocked() ProfileDTO {
	return ProfileDTO{Enabled: s.cfg.Profile.Enabled, Text: s.cfg.Profile.Text}
}

// ShowProfile sends the current profile on profile:open and shows the
// profile window.
func (h *Host) ShowProfile() {
	s := h.s
	s.mu.Lock()
	s.em.Emit(EventProfile, s.profileLocked())
	s.mu.Unlock()
	if s.profileWin != nil {
		s.profileWin.Show()
	}
}

// SetProfileSaver sets how SaveProfile persists and applies a profile.
func (h *Host) SetProfileSaver(save ProfileSaver) {
	s := h.s
	s.mu.Lock()
	defer s.mu.Unlock()
	s.saveProfile = save
}
