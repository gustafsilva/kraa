// Package llmfake is a deterministic OpenAI-compatible server for tests:
// POST /v1/chat/completions (SSE) and GET /v1/models, plus /__control/*
// endpoints so an out-of-process test (the Playwright suite) can script it.
// It does not import Wails.
package llmfake

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"
)

// DefaultChunks is what a chat request streams when no scenario is set.
var DefaultChunks = []string{"Texto ", "melhorado ", "pelo ", "fake."}

// Scenario scripts the next responses. Zero values mean "default".
type Scenario struct {
	Chunks        []string `json:"chunks"`
	ChunkDelayMS  int      `json:"chunkDelayMs"`
	Status        int      `json:"status"`  // != 0 && != 200: chat answers this status with an OpenAI error body
	Message       string   `json:"message"` // error message for Status
	Hang          bool     `json:"hang"`    // after the chunks, block until the client cancels
	ModelsStatus  int      `json:"modelsStatus"`
	ModelsMessage string   `json:"modelsMessage"`
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Request is a recorded chat request.
type Request struct {
	Model    string    `json:"model"`
	Messages []Message `json:"messages"`
	Canceled bool      `json:"canceled"`
}

type Server struct {
	mu            sync.Mutex
	defaultModels []string
	models        []string
	scenario      Scenario
	requests      []Request
}

func New(models ...string) *Server {
	return &Server{defaultModels: models, models: append([]string(nil), models...)}
}

func (s *Server) SetScenario(sc Scenario) { s.mu.Lock(); s.scenario = sc; s.mu.Unlock() }

func (s *Server) SetModels(models ...string) {
	s.mu.Lock()
	s.models = append([]string(nil), models...)
	s.mu.Unlock()
}

func (s *Server) Requests() []Request {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]Request(nil), s.requests...)
}

// Reset restores the default scenario and models and clears recorded requests.
func (s *Server) Reset() {
	s.mu.Lock()
	s.scenario, s.requests = Scenario{}, nil
	s.models = append([]string(nil), s.defaultModels...)
	s.mu.Unlock()
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.Method == http.MethodPost && r.URL.Path == "/v1/chat/completions":
		s.chat(w, r)
	case r.Method == http.MethodGet && r.URL.Path == "/v1/models":
		s.listModels(w)
	case r.Method == http.MethodPost && r.URL.Path == "/__control/scenario":
		var sc Scenario
		if err := json.NewDecoder(r.Body).Decode(&sc); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		s.SetScenario(sc)
		w.WriteHeader(http.StatusNoContent)
	case r.Method == http.MethodPost && r.URL.Path == "/__control/models":
		var models []string
		if err := json.NewDecoder(r.Body).Decode(&models); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		s.SetModels(models...)
		w.WriteHeader(http.StatusNoContent)
	case r.Method == http.MethodGet && r.URL.Path == "/__control/requests":
		writeJSON(w, http.StatusOK, s.Requests())
	case r.Method == http.MethodPost && r.URL.Path == "/__control/reset":
		s.Reset()
		w.WriteHeader(http.StatusNoContent)
	default:
		http.NotFound(w, r)
	}
}

func (s *Server) listModels(w http.ResponseWriter) {
	s.mu.Lock()
	sc, models := s.scenario, append([]string(nil), s.models...)
	s.mu.Unlock()
	if sc.ModelsStatus != 0 && sc.ModelsStatus != http.StatusOK {
		writeError(w, sc.ModelsStatus, sc.ModelsMessage)
		return
	}
	type model struct {
		ID     string `json:"id"`
		Object string `json:"object"`
	}
	data := make([]model, len(models))
	for i, m := range models {
		data[i] = model{ID: m, Object: "model"}
	}
	writeJSON(w, http.StatusOK, map[string]any{"object": "list", "data": data})
}

func (s *Server) chat(w http.ResponseWriter, r *http.Request) {
	var req Request
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	s.mu.Lock()
	sc := s.scenario
	s.requests = append(s.requests, req)
	idx := len(s.requests) - 1
	s.mu.Unlock()

	if sc.Status != 0 && sc.Status != http.StatusOK {
		writeError(w, sc.Status, sc.Message)
		return
	}
	chunks := sc.Chunks
	if chunks == nil {
		chunks = DefaultChunks
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.WriteHeader(http.StatusOK)
	flusher, _ := w.(http.Flusher)
	ctx := r.Context()
	canceled := func() {
		s.mu.Lock()
		if idx < len(s.requests) {
			s.requests[idx].Canceled = true
		}
		s.mu.Unlock()
	}

	for _, c := range chunks {
		payload, _ := json.Marshal(map[string]any{
			"choices": []map[string]any{{"delta": map[string]string{"content": c}}},
		})
		if _, err := w.Write([]byte("data: " + string(payload) + "\n\n")); err != nil {
			canceled()
			return
		}
		if flusher != nil {
			flusher.Flush()
		}
		select {
		case <-ctx.Done():
			canceled()
			return
		case <-time.After(time.Duration(sc.ChunkDelayMS) * time.Millisecond):
		}
	}
	if sc.Hang {
		<-ctx.Done()
		canceled()
		return
	}
	w.Write([]byte("data: [DONE]\n\n"))
	if flusher != nil {
		flusher.Flush()
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]any{"error": map[string]string{"message": msg}})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
