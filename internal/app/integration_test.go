// Integration tests wire ImproveService to a real improver.Improver and
// internal/llm.Client, talking HTTP to internal/llmfake. They exercise the
// path unit tests (which use fakeRunner) never touch: request encoding,
// SSE decoding and error mapping across package boundaries.
package app

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gustavofreitas/kraa/internal/config"
	"github.com/gustavofreitas/kraa/internal/llmfake"
)

type integration struct {
	*harness
	fake *llmfake.Server
	srv  *httptest.Server
	cfg  *config.Config
}

func newIntegration(t *testing.T) *integration {
	t.Helper()
	fake := llmfake.New("fake-a", "fake-b")
	srv := httptest.NewServer(fake)
	t.Cleanup(srv.Close)

	cfg := config.Default()
	cfg.Provider.BaseURL = srv.URL + "/v1"
	cfg.Provider.Model = "fake-a"
	cfg.Provider.TimeoutSeconds = 5

	h := newHarness(t, NewRunner(cfg), canSimulate)
	h.host.Configure(cfg, NewRunner(cfg))
	return &integration{harness: h, fake: fake, srv: srv, cfg: cfg}
}

// firstActionID returns the id of the first configured action whose
// UseProfile matches useProfile, failing the test if none does.
func firstActionID(t *testing.T, cfg *config.Config, useProfile bool) string {
	t.Helper()
	for _, a := range cfg.Actions {
		if a.UseProfile == useProfile {
			return a.ID
		}
	}
	t.Fatalf("nenhuma ação com use_profile=%v", useProfile)
	return ""
}

func TestIntegrationStreamThenReplaceRestoresClipboard(t *testing.T) {
	it := newIntegration(t)
	it.cb.SetText("original")

	id, err := it.svc.Start(StartRequest{Text: "texto do usuário", ActionID: firstActionID(t, it.cfg, true)})
	if err != nil {
		t.Fatal(err)
	}
	ev := it.em.waitFor(t, isEvent(EventDone, id))
	done, ok := ev.data.(DoneEvent)
	want := strings.Join(llmfake.DefaultChunks, "")
	if !ok || done.Text != want {
		t.Fatalf("done = %+v, want texto %q", ev.data, want)
	}

	reqs := it.fake.Requests()
	if len(reqs) != 1 {
		t.Fatalf("requests = %d, want 1", len(reqs))
	}
	if reqs[0].Model != "fake-a" {
		t.Errorf("model = %q, want fake-a", reqs[0].Model)
	}
	if !messagesContain(reqs[0].Messages, "texto do usuário") {
		t.Errorf("messages = %+v, want conter %q", reqs[0].Messages, "texto do usuário")
	}

	if err := it.svc.Replace(want); err != nil {
		t.Fatal(err)
	}
	if got, _ := it.cb.Text(); got != "original" {
		t.Fatalf("clipboard = %q, want restaurado para %q", got, "original")
	}
}

func TestIntegrationUnauthorizedIsPTBR(t *testing.T) {
	it := newIntegration(t)
	it.fake.SetScenario(llmfake.Scenario{Status: 401, Message: "chave inválida"})

	id, err := it.svc.Start(StartRequest{Text: "x", ActionID: firstActionID(t, it.cfg, true)})
	if err != nil {
		t.Fatal(err)
	}
	ev := it.em.waitFor(t, isEvent(EventError, id))
	errEv, ok := ev.data.(ErrorEvent)
	want := "chave inválida — verifique a api_key"
	if !ok || errEv.Message != want {
		t.Fatalf("erro = %+v, want mensagem %q", ev.data, want)
	}
}

func TestIntegrationServerDownSuggestsOllamaServe(t *testing.T) {
	it := newIntegration(t)
	it.srv.Close()

	id, err := it.svc.Start(StartRequest{Text: "x", ActionID: firstActionID(t, it.cfg, true)})
	if err != nil {
		t.Fatal(err)
	}
	ev := it.em.waitFor(t, isEvent(EventError, id))
	errEv, ok := ev.data.(ErrorEvent)
	if !ok || !strings.Contains(errEv.Message, "(ollama serve)") {
		t.Fatalf("erro = %+v, want conter %q", ev.data, "(ollama serve)")
	}
}

func TestIntegrationCloseMidStreamCancelsUpstream(t *testing.T) {
	it := newIntegration(t)
	it.fake.SetScenario(llmfake.Scenario{Chunks: []string{"parcial"}, Hang: true})

	id, err := it.svc.Start(StartRequest{Text: "x", ActionID: firstActionID(t, it.cfg, true)})
	if err != nil {
		t.Fatal(err)
	}
	it.em.waitFor(t, isEvent(EventChunk, id))

	it.svc.Close()

	// Polling with a deadline over the real network round trip to the fake
	// server: this is not a fixed sleep proving absence, it stops as soon
	// as the cancellation is observed.
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if r := it.fake.Requests(); len(r) == 1 && r[0].Canceled {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if r := it.fake.Requests(); len(r) != 1 || !r[0].Canceled {
		t.Fatalf("upstream não cancelado: %+v", r)
	}

	for _, ev := range it.em.snapshot() {
		if (ev.name == EventDone || ev.name == EventError) && eventID(ev) == id {
			t.Fatalf("evento %s emitido depois do Close", ev.name)
		}
	}
}

func TestIntegrationProfileOnlyForProfileActions(t *testing.T) {
	it := newIntegration(t)
	it.cfg.Profile = config.Profile{Enabled: true, Text: "Sou tester de integração"}
	it.host.Configure(it.cfg, NewRunner(it.cfg))

	id, err := it.svc.Start(StartRequest{Text: "x", ActionID: firstActionID(t, it.cfg, true)})
	if err != nil {
		t.Fatal(err)
	}
	it.em.waitFor(t, isEvent(EventDone, id))

	id, err = it.svc.Start(StartRequest{Text: "x", ActionID: firstActionID(t, it.cfg, false)})
	if err != nil {
		t.Fatal(err)
	}
	it.em.waitFor(t, isEvent(EventDone, id))

	reqs := it.fake.Requests()
	if len(reqs) != 2 {
		t.Fatalf("requests = %d, want 2", len(reqs))
	}
	if !messagesContain(reqs[0].Messages, "Sou tester de integração") {
		t.Error("ação com use_profile não recebeu o perfil")
	}
	if messagesContain(reqs[1].Messages, "Sou tester de integração") {
		t.Error("ação sem use_profile recebeu o perfil")
	}
}

func TestIntegrationListModelsFromProvider(t *testing.T) {
	it := newIntegration(t)
	models, err := it.svc.ListModels()
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(models, ","); got != "fake-a,fake-b" {
		t.Fatalf("models = %q, want %q", got, "fake-a,fake-b")
	}
}

// messagesContain reports whether any message content contains s.
func messagesContain(msgs []llmfake.Message, s string) bool {
	for _, m := range msgs {
		if strings.Contains(m.Content, s) {
			return true
		}
	}
	return false
}
