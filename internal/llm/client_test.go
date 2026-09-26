package llm

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// writeSSE writes a slice of raw SSE lines (already prefixed, e.g. "data: ..." or
// ": keep-alive") to w, flushing after each one, honoring request cancellation.
func writeSSE(w http.ResponseWriter, r *http.Request, lines []string) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.WriteHeader(http.StatusOK)
	flusher, _ := w.(http.Flusher)
	for _, line := range lines {
		select {
		case <-r.Context().Done():
			return
		default:
		}
		fmt.Fprintf(w, "%s\n\n", line)
		if flusher != nil {
			flusher.Flush()
		}
	}
}

func TestStream_ConcatenatesChunksInOrder(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeSSE(w, r, []string{
			`data: {"choices":[{"delta":{"content":"Ol"}}]}`,
			`data: {"choices":[{"delta":{"content":"á"}}]}`,
			`data: {"choices":[{"delta":{"content":"!"}}]}`,
			`data: [DONE]`,
		})
	}))
	defer server.Close()

	client := NewOpenAIClient(server.URL, "", "model-x", 5*time.Second)

	var mu sync.Mutex
	var got strings.Builder
	err := client.Stream(context.Background(), []Message{{Role: "user", Content: "oi"}}, func(chunk string) {
		mu.Lock()
		defer mu.Unlock()
		got.WriteString(chunk)
	})
	if err != nil {
		t.Fatalf("Stream() error = %v", err)
	}
	if got.String() != "Olá!" {
		t.Errorf("got %q, want %q", got.String(), "Olá!")
	}
}

func TestStream_AuthorizationHeader(t *testing.T) {
	tests := []struct {
		name   string
		apiKey string
		want   string
	}{
		{name: "sem api key", apiKey: "", want: ""},
		{name: "com api key", apiKey: "sk-secret", want: "Bearer sk-secret"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var gotAuth string
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				gotAuth = r.Header.Get("Authorization")
				writeSSE(w, r, []string{`data: [DONE]`})
			}))
			defer server.Close()

			client := NewOpenAIClient(server.URL, tt.apiKey, "model-x", 5*time.Second)
			if err := client.Stream(context.Background(), []Message{{Role: "user", Content: "oi"}}, func(string) {}); err != nil {
				t.Fatalf("Stream() error = %v", err)
			}
			if gotAuth != tt.want {
				t.Errorf("Authorization header = %q, want %q", gotAuth, tt.want)
			}
		})
	}
}

func TestStream_RequestBody(t *testing.T) {
	var gotBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, err := io.ReadAll(r.Body)
		if err != nil {
			t.Errorf("read body: %v", err)
		}
		if err := json.Unmarshal(raw, &gotBody); err != nil {
			t.Errorf("unmarshal body: %v", err)
		}
		if ct := r.Header.Get("Content-Type"); ct != "application/json" {
			t.Errorf("Content-Type = %q, want application/json", ct)
		}
		writeSSE(w, r, []string{`data: [DONE]`})
	}))
	defer server.Close()

	client := NewOpenAIClient(server.URL, "", "model-x", 5*time.Second)
	msgs := []Message{{Role: "system", Content: "seja conciso"}, {Role: "user", Content: "oi"}}
	if err := client.Stream(context.Background(), msgs, func(string) {}); err != nil {
		t.Fatalf("Stream() error = %v", err)
	}

	if gotBody["model"] != "model-x" {
		t.Errorf("model = %v, want model-x", gotBody["model"])
	}
	if gotBody["stream"] != true {
		t.Errorf("stream = %v, want true", gotBody["stream"])
	}
	msgsRaw, ok := gotBody["messages"].([]any)
	if !ok || len(msgsRaw) != 2 {
		t.Fatalf("messages = %v, want 2 entries", gotBody["messages"])
	}
	first, _ := msgsRaw[0].(map[string]any)
	if first["role"] != "system" || first["content"] != "seja conciso" {
		t.Errorf("messages[0] = %v", first)
	}
}

func TestStream_HTTPErrorReturnsAPIError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":{"message":"invalid api key"}}`))
	}))
	defer server.Close()

	client := NewOpenAIClient(server.URL, "bad-key", "model-x", 5*time.Second)
	err := client.Stream(context.Background(), []Message{{Role: "user", Content: "oi"}}, func(string) {})
	if err == nil {
		t.Fatal("Stream() error = nil, want *APIError")
	}

	var apiErr *APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("errors.As(%v, *APIError) = false", err)
	}
	if apiErr.Status != http.StatusUnauthorized {
		t.Errorf("Status = %d, want %d", apiErr.Status, http.StatusUnauthorized)
	}
	if apiErr.Message != "invalid api key" {
		t.Errorf("Message = %q, want %q", apiErr.Message, "invalid api key")
	}
}

func TestStream_HTTPErrorNonJSONBody(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte("boom, internal server error"))
	}))
	defer server.Close()

	client := NewOpenAIClient(server.URL, "", "model-x", 5*time.Second)
	err := client.Stream(context.Background(), []Message{{Role: "user", Content: "oi"}}, func(string) {})

	var apiErr *APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("errors.As(%v, *APIError) = false", err)
	}
	if apiErr.Status != http.StatusInternalServerError {
		t.Errorf("Status = %d, want %d", apiErr.Status, http.StatusInternalServerError)
	}
	if !strings.Contains(apiErr.Message, "boom") {
		t.Errorf("Message = %q, want it to contain body snippet", apiErr.Message)
	}
}

func TestStream_StreamErrorObject(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeSSE(w, r, []string{
			`data: {"choices":[{"delta":{"content":"parcial"}}]}`,
			`data: {"error":{"message":"contexto excedido"}}`,
		})
	}))
	defer server.Close()

	client := NewOpenAIClient(server.URL, "", "model-x", 5*time.Second)
	err := client.Stream(context.Background(), []Message{{Role: "user", Content: "oi"}}, func(string) {})

	var apiErr *APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("errors.As(%v, *APIError) = false", err)
	}
	if apiErr.Message != "contexto excedido" {
		t.Errorf("Message = %q, want %q", apiErr.Message, "contexto excedido")
	}
}

func TestStream_ClosedPortReturnsErrUnreachable(t *testing.T) {
	lis, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("net.Listen: %v", err)
	}
	addr := lis.Addr().String()
	if err := lis.Close(); err != nil {
		t.Fatalf("lis.Close: %v", err)
	}

	baseURL := "http://" + addr
	client := NewOpenAIClient(baseURL, "", "model-x", 5*time.Second)
	err = client.Stream(context.Background(), []Message{{Role: "user", Content: "oi"}}, func(string) {})

	if !errors.Is(err, ErrUnreachable) {
		t.Fatalf("errors.Is(%v, ErrUnreachable) = false", err)
	}
	if !strings.Contains(err.Error(), baseURL) {
		t.Errorf("error message %q does not contain baseURL %q", err.Error(), baseURL)
	}
}

func TestStream_ContextCancellation(t *testing.T) {
	firstChunkSent := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		flusher := w.(http.Flusher)
		fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\"parcial\"}}]}\n\n")
		flusher.Flush()
		close(firstChunkSent)
		<-r.Context().Done()
	}))
	defer server.Close()

	client := NewOpenAIClient(server.URL, "", "model-x", 5*time.Second)
	ctx, cancel := context.WithCancel(context.Background())

	var mu sync.Mutex
	var afterCancelCalled bool
	var canceled bool

	done := make(chan error, 1)
	go func() {
		done <- client.Stream(ctx, []Message{{Role: "user", Content: "oi"}}, func(string) {
			mu.Lock()
			defer mu.Unlock()
			if canceled {
				afterCancelCalled = true
			}
		})
	}()

	<-firstChunkSent
	mu.Lock()
	canceled = true
	mu.Unlock()
	cancel()

	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Errorf("Stream() error = %v, want context.Canceled", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Stream() did not return after context cancellation (read pendurado)")
	}

	mu.Lock()
	defer mu.Unlock()
	if afterCancelCalled {
		t.Error("onChunk called after cancellation was observed")
	}
}

func TestStream_IgnoresKeepAliveAndEmptyLines(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		flusher := w.(http.Flusher)
		fmt.Fprint(w, ": keep-alive\n\n")
		flusher.Flush()
		fmt.Fprint(w, "\n")
		flusher.Flush()
		fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\"\"}}]}\n\n")
		flusher.Flush()
		fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n\n")
		flusher.Flush()
		fmt.Fprint(w, "data: [DONE]\n\n")
		flusher.Flush()
	}))
	defer server.Close()

	client := NewOpenAIClient(server.URL, "", "model-x", 5*time.Second)
	var got strings.Builder
	err := client.Stream(context.Background(), []Message{{Role: "user", Content: "oi"}}, func(chunk string) {
		got.WriteString(chunk)
	})
	if err != nil {
		t.Fatalf("Stream() error = %v", err)
	}
	if got.String() != "ok" {
		t.Errorf("got %q, want %q", got.String(), "ok")
	}
}

func TestStream_DeadlineExceeded(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Aguarda o cancelamento vindo do cliente; um teto extra evita que o
		// handler (e, por consequência, server.Close()) fique pendurado caso
		// o transporte HTTP não detecte o fechamento da conexão a tempo.
		select {
		case <-r.Context().Done():
		case <-time.After(2 * time.Second):
		}
	}))
	defer server.Close()

	client := NewOpenAIClient(server.URL, "", "model-x", 50*time.Millisecond)
	err := client.Stream(context.Background(), []Message{{Role: "user", Content: "oi"}}, func(string) {})

	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("errors.Is(%v, context.DeadlineExceeded) = false", err)
	}
}

func TestStream_BaseURLTrailingSlash(t *testing.T) {
	var gotPath string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		writeSSE(w, r, []string{`data: [DONE]`})
	}))
	defer server.Close()

	client := NewOpenAIClient(server.URL+"/", "", "model-x", 5*time.Second)
	if err := client.Stream(context.Background(), []Message{{Role: "user", Content: "oi"}}, func(string) {}); err != nil {
		t.Fatalf("Stream() error = %v", err)
	}
	if gotPath != "/chat/completions" {
		t.Errorf("path = %q, want %q", gotPath, "/chat/completions")
	}
}

func TestStream_EndsWithoutDoneReturnsNil(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeSSE(w, r, []string{
			`data: {"choices":[{"delta":{"content":"sem fim"}}]}`,
		})
	}))
	defer server.Close()

	client := NewOpenAIClient(server.URL, "", "model-x", 5*time.Second)
	var got strings.Builder
	err := client.Stream(context.Background(), []Message{{Role: "user", Content: "oi"}}, func(chunk string) {
		got.WriteString(chunk)
	})
	if err != nil {
		t.Fatalf("Stream() error = %v, want nil (server never sent [DONE])", err)
	}
	if got.String() != "sem fim" {
		t.Errorf("got %q, want %q", got.String(), "sem fim")
	}
}

func captureBody(t *testing.T, opts ...Option) map[string]any {
	t.Helper()
	var gotBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(raw, &gotBody); err != nil {
			t.Errorf("unmarshal body: %v", err)
		}
		writeSSE(w, r, []string{`data: [DONE]`})
	}))
	defer server.Close()

	client := NewOpenAIClient(server.URL, "", "m", 5*time.Second, opts...)
	if err := client.Stream(context.Background(), []Message{{Role: "user", Content: "oi"}}, func(string) {}); err != nil {
		t.Fatalf("Stream() error = %v", err)
	}
	return gotBody
}

func TestStream_SendsTemperatureWhenSet(t *testing.T) {
	body := captureBody(t, WithTemperature(0.2))
	if body["temperature"] != 0.2 {
		t.Errorf("temperature = %v, want 0.2", body["temperature"])
	}
}

func TestStream_SendsZeroTemperature(t *testing.T) {
	body := captureBody(t, WithTemperature(0))
	v, ok := body["temperature"]
	if !ok || v != 0.0 {
		t.Errorf("temperature = %v (present=%v), want 0", v, ok)
	}
}

func TestStream_OmitsTemperatureByDefault(t *testing.T) {
	body := captureBody(t)
	if _, ok := body["temperature"]; ok {
		t.Errorf("temperature present = %v, want omitted", body["temperature"])
	}
}
