package improver_test

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"

	"github.com/gustavofreitas/prompt-improve/internal/config"
	"github.com/gustavofreitas/prompt-improve/internal/improver"
	"github.com/gustavofreitas/prompt-improve/internal/llm"
)

// fakeClient implements llm.Client, recording the messages it received and
// emitting a scripted sequence of chunks.
type fakeClient struct {
	mu       sync.Mutex
	gotMsgs  []llm.Message
	chunks   []string
	streamed []string

	// onEachChunk, when set, is called after each scripted chunk is
	// forwarded to onChunk, allowing tests to cancel mid-stream.
	onEachChunk func()

	// err is returned by Stream after emitting all chunks (or immediately
	// if chunks is empty).
	err error
}

func (f *fakeClient) Stream(ctx context.Context, msgs []llm.Message, onChunk func(string)) error {
	f.mu.Lock()
	f.gotMsgs = msgs
	f.mu.Unlock()

	for _, c := range f.chunks {
		onChunk(c)
		f.mu.Lock()
		f.streamed = append(f.streamed, c)
		f.mu.Unlock()
		if f.onEachChunk != nil {
			f.onEachChunk()
		}
	}
	return f.err
}

func testConfig(t *testing.T) *config.Config {
	t.Helper()
	return &config.Config{
		Hotkey: config.DefaultHotkey,
		Provider: config.Provider{
			BaseURL: "http://localhost:11434/v1",
			Model:   "llama3.2",
		},
		MaxInputChars: 100,
		Actions: []config.Action{
			{ID: "formal", Category: "Mensagem", Label: "Mais formal", Instruction: "Reescreva em tom formal."},
		},
	}
}

const systemPrompt = "Você reescreve textos. Responda SOMENTE com o texto final, sem aspas, sem explicações, no mesmo idioma do texto original salvo instrução contrária."

func TestRun_WithAction_BuildsSystemAndUserMessages(t *testing.T) {
	cfg := testConfig(t)
	fake := &fakeClient{chunks: []string{"ola"}}
	imp := improver.New(cfg, fake)

	err := imp.Run(context.Background(), improver.Request{
		Text:     "oi tudo bem",
		ActionID: "formal",
	}, func(string) {})
	if err != nil {
		t.Fatalf("Run() error = %v, want nil", err)
	}

	if len(fake.gotMsgs) != 2 {
		t.Fatalf("got %d messages, want 2", len(fake.gotMsgs))
	}
	if fake.gotMsgs[0].Role != "system" || fake.gotMsgs[0].Content != systemPrompt {
		t.Errorf("system message = %+v, want fixed system prompt", fake.gotMsgs[0])
	}
	user := fake.gotMsgs[1].Content
	if fake.gotMsgs[1].Role != "user" {
		t.Errorf("second message role = %q, want user", fake.gotMsgs[1].Role)
	}
	if !strings.Contains(user, "Reescreva em tom formal.") {
		t.Errorf("user message %q does not contain action instruction", user)
	}
	if !strings.Contains(user, "<texto>\noi tudo bem\n</texto>") {
		t.Errorf("user message %q does not contain delimited text", user)
	}
}

func TestRun_WithFreeInstructionOnly(t *testing.T) {
	cfg := testConfig(t)
	fake := &fakeClient{}
	imp := improver.New(cfg, fake)

	err := imp.Run(context.Background(), improver.Request{
		Text:            "oi tudo bem",
		FreeInstruction: "deixe mais curto",
	}, func(string) {})
	if err != nil {
		t.Fatalf("Run() error = %v, want nil", err)
	}

	user := fake.gotMsgs[1].Content
	if !strings.Contains(user, "Instrução adicional: deixe mais curto") {
		t.Errorf("user message %q does not contain free instruction", user)
	}
	if !strings.Contains(user, "<texto>\noi tudo bem\n</texto>") {
		t.Errorf("user message %q does not contain delimited text", user)
	}
}

func TestRun_WithActionAndFreeInstruction_BothAppear(t *testing.T) {
	cfg := testConfig(t)
	fake := &fakeClient{}
	imp := improver.New(cfg, fake)

	err := imp.Run(context.Background(), improver.Request{
		Text:            "oi tudo bem",
		ActionID:        "formal",
		FreeInstruction: "deixe mais curto",
	}, func(string) {})
	if err != nil {
		t.Fatalf("Run() error = %v, want nil", err)
	}

	user := fake.gotMsgs[1].Content
	actionIdx := strings.Index(user, "Reescreva em tom formal.")
	freeIdx := strings.Index(user, "Instrução adicional: deixe mais curto")
	if actionIdx == -1 || freeIdx == -1 {
		t.Fatalf("user message %q missing action and/or free instruction", user)
	}
	if actionIdx > freeIdx {
		t.Errorf("action instruction must come before free instruction in %q", user)
	}
}

func TestRun_EmptyText_ReturnsErrEmptyText(t *testing.T) {
	cfg := testConfig(t)
	fake := &fakeClient{}
	imp := improver.New(cfg, fake)

	err := imp.Run(context.Background(), improver.Request{
		Text:     "   ",
		ActionID: "formal",
	}, func(string) {})
	if !errors.Is(err, improver.ErrEmptyText) {
		t.Fatalf("Run() error = %v, want ErrEmptyText", err)
	}
	if fake.gotMsgs != nil {
		t.Errorf("LLM should not be called on validation error")
	}
}

func TestRun_TextTooLong_ReturnsErrTooLong(t *testing.T) {
	cfg := testConfig(t)
	cfg.MaxInputChars = 5
	fake := &fakeClient{}
	imp := improver.New(cfg, fake)

	err := imp.Run(context.Background(), improver.Request{
		Text:     "isso tem mais de cinco caracteres",
		ActionID: "formal",
	}, func(string) {})
	if !errors.Is(err, improver.ErrTooLong) {
		t.Fatalf("Run() error = %v, want ErrTooLong", err)
	}
	if fake.gotMsgs != nil {
		t.Errorf("LLM should not be called on validation error")
	}
}

func TestRun_UnknownAction_ReturnsErrUnknownAction(t *testing.T) {
	cfg := testConfig(t)
	fake := &fakeClient{}
	imp := improver.New(cfg, fake)

	err := imp.Run(context.Background(), improver.Request{
		Text:     "oi tudo bem",
		ActionID: "does-not-exist",
	}, func(string) {})
	if !errors.Is(err, improver.ErrUnknownAction) {
		t.Fatalf("Run() error = %v, want ErrUnknownAction", err)
	}
	if fake.gotMsgs != nil {
		t.Errorf("LLM should not be called on validation error")
	}
}

func TestRun_NoActionNoFreeInstruction_ReturnsError(t *testing.T) {
	cfg := testConfig(t)
	fake := &fakeClient{}
	imp := improver.New(cfg, fake)

	err := imp.Run(context.Background(), improver.Request{
		Text: "oi tudo bem",
	}, func(string) {})
	if err == nil {
		t.Fatalf("Run() error = nil, want an error when no action and no free instruction given")
	}
	if fake.gotMsgs != nil {
		t.Errorf("LLM should not be called on validation error")
	}
}

func TestRun_ValidationHappensBeforeLLMCall(t *testing.T) {
	cfg := testConfig(t)
	fake := &fakeClient{}
	imp := improver.New(cfg, fake)

	_ = imp.Run(context.Background(), improver.Request{Text: ""}, func(string) {})
	if fake.gotMsgs != nil {
		t.Fatalf("LLM Stream must not be invoked when validation fails")
	}
}

func TestRun_CancelMidStream_ReturnsContextCanceled(t *testing.T) {
	cfg := testConfig(t)
	ctx, cancel := context.WithCancel(context.Background())

	var forwarded []string
	fake := &fakeClient{
		chunks: []string{"um", "dois", "tres"},
		onEachChunk: func() {
			// Cancel after the first chunk has been forwarded; subsequent
			// scripted chunks must not reach onChunk.
			if len(forwarded) == 1 {
				cancel()
			}
		},
	}
	imp := improver.New(cfg, fake)

	err := imp.Run(ctx, improver.Request{
		Text:     "oi tudo bem",
		ActionID: "formal",
	}, func(chunk string) {
		forwarded = append(forwarded, chunk)
	})

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("Run() error = %v, want context.Canceled", err)
	}
	if len(forwarded) != 1 {
		t.Fatalf("forwarded chunks = %v, want exactly 1 chunk forwarded before cancel", forwarded)
	}
	if forwarded[0] != "um" {
		t.Fatalf("forwarded[0] = %q, want %q", forwarded[0], "um")
	}
}

func TestClean(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{
			name: "fenced with language tag",
			in:   "```go\nfmt.Println(\"oi\")\n```",
			want: "fmt.Println(\"oi\")",
		},
		{
			name: "fenced without language tag",
			in:   "```\ntexto simples\n```",
			want: "texto simples",
		},
		{
			name: "wrapped in straight double quotes",
			in:   `"texto entre aspas"`,
			want: "texto entre aspas",
		},
		{
			name: "wrapped in straight single quotes",
			in:   `'texto entre aspas'`,
			want: "texto entre aspas",
		},
		{
			name: "wrapped in curly quotes",
			in:   "“texto entre aspas curvas”",
			want: "texto entre aspas curvas",
		},
		{
			name: "wrapped in guillemets",
			in:   "«texto entre aspas francesas»",
			want: "texto entre aspas francesas",
		},
		{
			name: "internal quotes preserved when not wrapping whole text",
			in:   `Ele disse "oi" para todos`,
			want: `Ele disse "oi" para todos`,
		},
		{
			name: "multiple straight-double-quoted spans left unchanged",
			in:   `"a" e "b"`,
			want: `"a" e "b"`,
		},
		{
			name: "multiple curly-quoted spans left unchanged",
			in:   "“a” e “b”",
			want: "“a” e “b”",
		},
		{
			name: "multiple guillemet-quoted spans left unchanged",
			in:   "«x» e «y»",
			want: "«x» e «y»",
		},
		{
			// An apostrophe is the same character as a closing single
			// quote, so a single-quoted span containing one is treated as
			// ambiguous (more than one quote character in play) and left
			// untouched rather than risk truncating at the apostrophe.
			name: "single quotes containing an apostrophe are left unchanged",
			in:   "'it's raining'",
			want: "'it's raining'",
		},
		{
			name: "internal fence preserved when not wrapping whole text",
			in:   "Antes\n```\nbloco\n```\nDepois",
			want: "Antes\n```\nbloco\n```\nDepois",
		},
		{
			name: "whitespace only",
			in:   "   \n\t  ",
			want: "",
		},
		{
			name: "plain text is unchanged aside from trim",
			in:   "  texto normal  ",
			want: "texto normal",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := improver.Clean(tt.in)
			if got != tt.want {
				t.Errorf("Clean(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}
