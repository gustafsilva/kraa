package llmfake_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gustavofreitas/kraa/internal/llmfake"
)

func postChat(t *testing.T, url, model string) *http.Response {
	t.Helper()
	body := `{"model":"` + model + `","stream":true,"messages":[{"role":"user","content":"oi"}]}`
	resp, err := http.Post(url+"/v1/chat/completions", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

func TestChatStreamsDefaultChunksThenDone(t *testing.T) {
	srv := httptest.NewServer(llmfake.New("fake-a"))
	defer srv.Close()

	resp := postChat(t, srv.URL, "fake-a")
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	got := string(raw)

	if ct := resp.Header.Get("Content-Type"); ct != "text/event-stream" {
		t.Fatalf("Content-Type = %q", ct)
	}
	for _, c := range llmfake.DefaultChunks {
		b, _ := json.Marshal(c)
		if !strings.Contains(got, `"content":`+string(b)) {
			t.Errorf("stream sem o chunk %q:\n%s", c, got)
		}
	}
	if !strings.HasSuffix(strings.TrimSpace(got), "data: [DONE]") {
		t.Errorf("stream não termina com [DONE]:\n%s", got)
	}
}

func TestChatRecordsRequest(t *testing.T) {
	fake := llmfake.New("fake-a")
	srv := httptest.NewServer(fake)
	defer srv.Close()

	resp := postChat(t, srv.URL, "fake-a")
	io.Copy(io.Discard, resp.Body)
	resp.Body.Close()

	reqs := fake.Requests()
	if len(reqs) != 1 || reqs[0].Model != "fake-a" || reqs[0].Messages[0].Content != "oi" || reqs[0].Canceled {
		t.Fatalf("Requests() = %+v", reqs)
	}
}

func TestChatErrorStatusReturnsOpenAIErrorBody(t *testing.T) {
	fake := llmfake.New()
	fake.SetScenario(llmfake.Scenario{Status: 401, Message: "chave inválida"})
	srv := httptest.NewServer(fake)
	defer srv.Close()

	resp := postChat(t, srv.URL, "x")
	defer resp.Body.Close()
	var body struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	json.NewDecoder(resp.Body).Decode(&body)
	if resp.StatusCode != 401 || body.Error.Message != "chave inválida" {
		t.Fatalf("status=%d body=%+v", resp.StatusCode, body)
	}
}

func TestChatHangMarksCanceledWhenClientGoesAway(t *testing.T) {
	fake := llmfake.New()
	fake.SetScenario(llmfake.Scenario{Chunks: []string{"parcial"}, Hang: true})
	srv := httptest.NewServer(fake)
	defer srv.Close()

	ctx, cancel := context.WithCancel(context.Background())
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, srv.URL+"/v1/chat/completions",
		strings.NewReader(`{"model":"m","messages":[]}`))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	buf := make([]byte, 64)
	resp.Body.Read(buf) // primeiro chunk chegou
	cancel()
	resp.Body.Close()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if r := fake.Requests(); len(r) == 1 && r[0].Canceled {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("pedido não marcado como cancelado: %+v", fake.Requests())
}

func TestModelsListsConfiguredModels(t *testing.T) {
	srv := httptest.NewServer(llmfake.New("fake-a", "fake-b"))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/v1/models")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var body struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	json.NewDecoder(resp.Body).Decode(&body)
	if len(body.Data) != 2 || body.Data[0].ID != "fake-a" || body.Data[1].ID != "fake-b" {
		t.Fatalf("models = %+v", body.Data)
	}
}

func TestModelsErrorStatus(t *testing.T) {
	fake := llmfake.New("fake-a")
	fake.SetScenario(llmfake.Scenario{ModelsStatus: 500, ModelsMessage: "falhou"})
	srv := httptest.NewServer(fake)
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/v1/models")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 500 {
		t.Fatalf("status = %d", resp.StatusCode)
	}
}

func TestControlEndpointsDriveTheFake(t *testing.T) {
	fake := llmfake.New("fake-a")
	srv := httptest.NewServer(fake)
	defer srv.Close()

	sc, _ := json.Marshal(llmfake.Scenario{Chunks: []string{"x"}})
	if resp, _ := http.Post(srv.URL+"/__control/scenario", "application/json", bytes.NewReader(sc)); resp.StatusCode != http.StatusNoContent {
		t.Fatalf("scenario status = %d", resp.StatusCode)
	}
	resp := postChat(t, srv.URL, "fake-a")
	raw, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if !strings.Contains(string(raw), `"content":"x"`) {
		t.Fatalf("cenário não aplicado: %s", raw)
	}

	r, _ := http.Get(srv.URL + "/__control/requests")
	var reqs []llmfake.Request
	json.NewDecoder(r.Body).Decode(&reqs)
	r.Body.Close()
	if len(reqs) != 1 {
		t.Fatalf("requests = %+v", reqs)
	}

	http.Post(srv.URL+"/__control/reset", "application/json", nil)
	if len(fake.Requests()) != 0 {
		t.Fatal("reset não limpou os pedidos")
	}
	resp = postChat(t, srv.URL, "fake-a")
	raw, _ = io.ReadAll(resp.Body)
	resp.Body.Close()
	if !strings.Contains(string(raw), `"content":"Texto "`) {
		t.Fatalf("reset não voltou ao cenário padrão: %s", raw)
	}

	models, _ := json.Marshal([]string{"z"})
	http.Post(srv.URL+"/__control/models", "application/json", bytes.NewReader(models))
	mr, _ := http.Get(srv.URL + "/v1/models")
	raw, _ = io.ReadAll(mr.Body)
	mr.Body.Close()
	if !strings.Contains(string(raw), `"id":"z"`) {
		t.Fatalf("models não trocados: %s", raw)
	}
}
