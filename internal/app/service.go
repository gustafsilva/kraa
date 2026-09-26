// Package app holds ImproveService, the Go API bound to the frontend, and
// the Host used by main.go to drive it (hotkey trigger, config reload).
// Only wails.go imports Wails; everything else depends on small interfaces
// so it can be tested with fakes.
package app

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gustavofreitas/prompt-improve/internal/config"
	"github.com/gustavofreitas/prompt-improve/internal/improver"
	"github.com/gustavofreitas/prompt-improve/internal/llm"
	"github.com/gustavofreitas/prompt-improve/internal/platform"
)

// Event names emitted to the frontend.
const (
	EventChunk     = "improve:chunk"
	EventDone      = "improve:done"
	EventError     = "improve:error"
	EventSelection = "selection:new"
	EventState     = "state:changed"
)

// Default delays (overridable through Options).
const (
	defaultCaptureWait = 400 * time.Millisecond
	defaultFocusDelay  = 150 * time.Millisecond
	defaultPasteSettle = 300 * time.Millisecond
)

// Emitter sends an event to the frontend.
type Emitter interface {
	Emit(name string, data any)
}

// Runner streams an improvement; *improver.Improver satisfies it.
type Runner interface {
	Run(ctx context.Context, r improver.Request, onChunk func(string)) error
}

// Window is the modal window. Show centers, shows and focuses it.
// ReleaseFocus gives focus back to the previously active app (hides the
// whole app on macOS; no-op elsewhere, where hiding the window suffices).
type Window interface {
	Show()
	Hide()
	ReleaseFocus()
}

// ActionDTO is an action as exposed to the frontend (no instruction).
type ActionDTO struct {
	ID       string `json:"id"`
	Category string `json:"category"`
	Label    string `json:"label"`
}

// State is the modal state returned by GetState and sent on state:changed.
type State struct {
	Text       string      `json:"text"`
	Actions    []ActionDTO `json:"actions"`
	CanReplace bool        `json:"canReplace"`
	Warning    string      `json:"warning"`
	Error      string      `json:"error"`
}

// StartRequest is the input of Start.
type StartRequest struct {
	Text            string `json:"text"`
	ActionID        string `json:"actionId"`
	FreeInstruction string `json:"freeInstruction"`
}

// ChunkEvent is the payload of improve:chunk.
type ChunkEvent struct {
	ID    string `json:"id"`
	Delta string `json:"delta"`
}

// DoneEvent is the payload of improve:done; Text is improver.Clean(total).
type DoneEvent struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

// ErrorEvent is the payload of improve:error; Message is PT-BR.
type ErrorEvent struct {
	ID      string `json:"id"`
	Message string `json:"message"`
}

// SelectionEvent is the payload of selection:new.
type SelectionEvent struct {
	Text       string `json:"text"`
	CanReplace bool   `json:"canReplace"`
	Warning    string `json:"warning"`
}

// Options configures New. Zero durations/Sleep fall back to defaults.
type Options struct {
	Config    *config.Config
	Runner    Runner
	Emitter   Emitter
	Clipboard platform.Clipboard
	Keys      platform.KeySender
	Window    Window
	Session   platform.Session

	Sleep       func(time.Duration)
	CaptureWait time.Duration
	FocusDelay  time.Duration
	PasteSettle time.Duration
}

type request struct {
	id     string
	ctx    context.Context
	cancel context.CancelFunc
}

// ImproveService is bound to the frontend. Every exported method is a
// binding, so non-frontend operations live on Host.
type ImproveService struct {
	mu            sync.Mutex
	cfg           *config.Config
	runner        Runner
	session       platform.Session
	text          string
	loadErr       string
	hotkeyWarning string
	cur           *request

	em  Emitter
	cb  platform.Clipboard
	ks  platform.KeySender
	win Window

	sleep       func(time.Duration)
	captureWait time.Duration
	focusDelay  time.Duration
	pasteSettle time.Duration

	triggerMu sync.Mutex
	seq       atomic.Uint64
}

// Host drives the service from main.go (hotkey, tray, config reload).
type Host struct{ s *ImproveService }

// New builds the service and its host.
func New(o Options) (*ImproveService, *Host) {
	s := &ImproveService{
		cfg:         o.Config,
		runner:      o.Runner,
		session:     o.Session,
		em:          o.Emitter,
		cb:          o.Clipboard,
		ks:          o.Keys,
		win:         o.Window,
		sleep:       o.Sleep,
		captureWait: o.CaptureWait,
		focusDelay:  o.FocusDelay,
		pasteSettle: o.PasteSettle,
	}
	if s.cfg == nil {
		s.cfg = config.Default()
	}
	if s.sleep == nil {
		s.sleep = time.Sleep
	}
	if s.captureWait == 0 {
		s.captureWait = defaultCaptureWait
	}
	if s.focusDelay == 0 {
		s.focusDelay = defaultFocusDelay
	}
	if s.pasteSettle == 0 {
		s.pasteSettle = defaultPasteSettle
	}
	return s, &Host{s: s}
}

// ---- bound methods ---------------------------------------------------------

// GetState returns the current modal state.
func (s *ImproveService) GetState() State {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.stateLocked()
}

// Start runs an improvement in the background and returns its request id.
// Any in-flight request is cancelled first. Results arrive as
// improve:chunk / improve:done / improve:error events carrying this id.
func (s *ImproveService) Start(req StartRequest) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.runner == nil {
		return "", errors.New("O serviço de melhoria não está configurado.")
	}
	s.cancelLocked()

	ctx, cancel := context.WithCancel(context.Background())
	r := &request{id: fmt.Sprintf("req-%d", s.seq.Add(1)), ctx: ctx, cancel: cancel}
	s.cur = r
	go s.run(r, s.runner, s.cfg, improver.Request{
		Text:            req.Text,
		ActionID:        req.ActionID,
		FreeInstruction: req.FreeInstruction,
	})
	return r.id, nil
}

// Cancel stops the request with the given id; no further events are
// emitted for it. Unknown or finished ids are ignored.
func (s *ImproveService) Cancel(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cur != nil && s.cur.id == id {
		s.cancelLocked()
	}
}

// Replace pastes text into the source app (hides the window, returns focus,
// then pastes and restores the clipboard). Fails when automatic paste is not
// available in this session.
func (s *ImproveService) Replace(text string) error {
	s.mu.Lock()
	can, reason := s.session.CanSimulateKeys, s.session.Reason
	s.mu.Unlock()

	if !can {
		msg := "A substituição automática não está disponível. Use Copiar e cole manualmente."
		if reason != "" {
			msg += " " + reason
		}
		return errors.New(msg)
	}
	if strings.TrimSpace(text) == "" {
		return errors.New("Não há texto para substituir.")
	}

	s.win.Hide()
	s.win.ReleaseFocus()
	s.sleep(s.focusDelay)
	if err := platform.Paste(s.cb, s.ks, text, s.pasteSettle); err != nil {
		return fmt.Errorf("Não foi possível colar o texto: %w", err)
	}
	return nil
}

// Copy puts text in the clipboard.
func (s *ImproveService) Copy(text string) error {
	if !s.cb.SetText(text) {
		return errors.New("Não foi possível copiar para a área de transferência.")
	}
	return nil
}

// Close cancels any in-flight request and hides the window.
func (s *ImproveService) Close() {
	s.mu.Lock()
	s.cancelLocked()
	s.mu.Unlock()
	s.win.Hide()
}

// ---- internals -------------------------------------------------------------

func (s *ImproveService) cancelLocked() {
	if s.cur != nil {
		s.cur.cancel()
		s.cur = nil
	}
}

// emitIfCurrentLocked emits only while r is still the active request; the
// lock is held so Cancel/Start returning guarantees no later event for r.
func (s *ImproveService) emitIfCurrentLocked(r *request, name string, data any) bool {
	if s.cur != r || r.ctx.Err() != nil {
		return false
	}
	s.em.Emit(name, data)
	return true
}

func (s *ImproveService) run(r *request, runner Runner, cfg *config.Config, req improver.Request) {
	var total strings.Builder
	err := runner.Run(r.ctx, req, func(delta string) {
		s.mu.Lock()
		defer s.mu.Unlock()
		if s.emitIfCurrentLocked(r, EventChunk, ChunkEvent{ID: r.id, Delta: delta}) {
			total.WriteString(delta)
		}
	})

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cur != r || r.ctx.Err() != nil || errors.Is(err, context.Canceled) {
		return
	}
	if err == nil {
		s.em.Emit(EventDone, DoneEvent{ID: r.id, Text: improver.Clean(total.String())})
	} else {
		s.em.Emit(EventError, ErrorEvent{ID: r.id, Message: errorMessage(err, cfg)})
	}
	s.cur = nil
	r.cancel()
}

func (s *ImproveService) stateLocked() State {
	actions := make([]ActionDTO, 0, len(s.cfg.Actions))
	for _, a := range s.cfg.Actions {
		actions = append(actions, ActionDTO{ID: a.ID, Category: a.Category, Label: a.Label})
	}
	return State{
		Text:       s.text,
		Actions:    actions,
		CanReplace: s.session.CanSimulateKeys,
		Warning:    s.warningLocked(),
		Error:      s.loadErr,
	}
}

func (s *ImproveService) warningLocked() string {
	var parts []string
	for _, p := range []string{s.session.Reason, s.hotkeyWarning} {
		if p != "" {
			parts = append(parts, p)
		}
	}
	return strings.Join(parts, " ")
}

func (s *ImproveService) emitStateLocked() {
	s.em.Emit(EventState, s.stateLocked())
}

// errorMessage maps runner errors to PT-BR, user-facing messages.
func errorMessage(err error, cfg *config.Config) string {
	var apiErr *llm.APIError
	switch {
	case errors.Is(err, llm.ErrUnreachable):
		return fmt.Sprintf("Não foi possível conectar em %s. O Ollama está rodando? (ollama serve)", cfg.Provider.BaseURL)
	case errors.As(err, &apiErr):
		msg := apiErr.Message
		if msg == "" {
			msg = fmt.Sprintf("Erro do servidor (status %d)", apiErr.Status)
		}
		switch apiErr.Status {
		case 401, 403:
			return msg + " — verifique a api_key"
		case 404:
			return msg + " — verifique o model"
		}
		return msg
	case errors.Is(err, context.DeadlineExceeded):
		return "Tempo esgotado aguardando o modelo. Tente novamente."
	case errors.Is(err, improver.ErrTooLong):
		return fmt.Sprintf("Texto muito longo (máximo de %d caracteres).", cfg.MaxInputChars)
	case errors.Is(err, improver.ErrEmptyText):
		return "O texto está vazio. Selecione ou digite um texto."
	case errors.Is(err, improver.ErrNoInstruction):
		return "Escolha uma ação ou escreva uma instrução."
	case errors.Is(err, improver.ErrUnknownAction):
		return "Ação desconhecida. Recarregue a configuração."
	}
	return "Erro inesperado: " + err.Error()
}

// ---- Host ------------------------------------------------------------------

// Trigger runs the hotkey flow: capture the selection (while the source app
// still has focus), publish it, then show the window. Safe to call from any
// goroutine; concurrent triggers are serialized.
func (h *Host) Trigger() {
	s := h.s
	s.triggerMu.Lock()
	defer s.triggerMu.Unlock()

	s.mu.Lock()
	sess := s.session
	s.mu.Unlock()

	var text string
	if sess.CanSimulateKeys {
		t, restore, err := platform.Capture(s.cb, s.ks, s.captureWait)
		restore() // the captured text is kept in memory
		switch {
		case err == nil:
			text = t
		case errors.Is(err, platform.ErrNoSelection):
		default:
			log.Printf("app: captura falhou: %v", err)
		}
	} else if t, ok := s.cb.Text(); ok {
		text = t
	}

	s.mu.Lock()
	s.cancelLocked()
	s.text = text
	s.em.Emit(EventSelection, SelectionEvent{
		Text:       text,
		CanReplace: s.session.CanSimulateKeys,
		Warning:    s.warningLocked(),
	})
	s.mu.Unlock()

	s.win.Show()
}

// ShowWindow shows the window without capturing anything.
func (h *Host) ShowWindow() { h.s.win.Show() }

// Configure swaps the config and runner (startup/reload) and clears the
// config error.
func (h *Host) Configure(cfg *config.Config, runner Runner) {
	s := h.s
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cfg, s.runner, s.loadErr = cfg, runner, ""
	s.emitStateLocked()
}

// SetSession updates key-simulation capability (canReplace + warning).
func (h *Host) SetSession(sess platform.Session) {
	s := h.s
	s.mu.Lock()
	defer s.mu.Unlock()
	s.session = sess
	s.emitStateLocked()
}

// SetError sets the PT-BR config error shown in the modal ("" clears it).
func (h *Host) SetError(msg string) {
	s := h.s
	s.mu.Lock()
	defer s.mu.Unlock()
	s.loadErr = msg
	s.emitStateLocked()
}

// SetHotkeyWarning sets a PT-BR warning about hotkey registration.
func (h *Host) SetHotkeyWarning(msg string) {
	s := h.s
	s.mu.Lock()
	defer s.mu.Unlock()
	s.hotkeyWarning = msg
	s.emitStateLocked()
}
