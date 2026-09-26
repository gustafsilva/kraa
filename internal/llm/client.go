// Package llm implementa um cliente HTTP compatível com a API de chat
// completions no formato OpenAI (usado por Ollama, Ollama Cloud, OpenAI e
// OpenRouter), consumindo a resposta em streaming via Server-Sent Events.
package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// maxSSELineBytes é o tamanho máximo de linha aceito pelo scanner de SSE.
const maxSSELineBytes = 1024 * 1024

// maxErrorBodySnippet é o tamanho máximo do trecho de corpo de erro não-JSON
// usado como mensagem de um *APIError.
const maxErrorBodySnippet = 300

// ErrUnreachable indica falha de conexão com o servidor (porta fechada, DNS
// não resolvido, recusa de conexão etc). Use errors.Is(err, ErrUnreachable)
// para identificar esse caso.
var ErrUnreachable = errors.New("não foi possível conectar ao servidor")

// Message é uma mensagem de chat no formato OpenAI.
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Client executa uma conversa de chat em streaming.
type Client interface {
	// Stream envia msgs ao endpoint de chat completions e invoca onChunk
	// para cada pedaço de texto recebido, na ordem em que chegam.
	Stream(ctx context.Context, msgs []Message, onChunk func(string)) error
}

// APIError representa uma resposta de erro do servidor (HTTP não-2xx, ou um
// objeto "error" recebido dentro do stream SSE).
type APIError struct {
	Status  int
	Message string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("llm: %s (status %d)", e.Message, e.Status)
}

type openAIClient struct {
	baseURL     string
	apiKey      string
	model       string
	timeout     time.Duration
	temperature *float64
	httpClient  *http.Client
}

// Option configura um Client criado por NewOpenAIClient.
type Option func(*openAIClient)

// WithTemperature envia temperature em toda requisição (sem a opção, o
// campo é omitido e vale o padrão do servidor).
func WithTemperature(t float64) Option {
	return func(c *openAIClient) { c.temperature = &t }
}

// NewOpenAIClient cria um Client que conversa com um endpoint compatível com
// a API OpenAI em {baseURL}/chat/completions. apiKey pode ser vazio (nesse
// caso nenhum header Authorization é enviado). timeout limita a duração
// total de cada chamada a Stream. opts ajusta parâmetros opcionais da
// requisição, como a temperatura (WithTemperature).
func NewOpenAIClient(baseURL, apiKey, model string, timeout time.Duration, opts ...Option) Client {
	c := &openAIClient{
		baseURL:    strings.TrimRight(baseURL, "/"),
		apiKey:     apiKey,
		model:      model,
		timeout:    timeout,
		httpClient: &http.Client{},
	}
	for _, o := range opts {
		o(c)
	}
	return c
}

type chatRequest struct {
	Model       string    `json:"model"`
	Messages    []Message `json:"messages"`
	Stream      bool      `json:"stream"`
	Temperature *float64  `json:"temperature,omitempty"` // ponteiro: 0 é enviado, nil é omitido
}

type sseErrorPayload struct {
	Message string `json:"message"`
}

type sseChunk struct {
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
	} `json:"choices"`
	Error *sseErrorPayload `json:"error"`
}

type errorResponseBody struct {
	Error sseErrorPayload `json:"error"`
}

func (c *openAIClient) Stream(ctx context.Context, msgs []Message, onChunk func(string)) error {
	ctx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()

	body, err := json.Marshal(chatRequest{Model: c.model, Messages: msgs, Stream: true, Temperature: c.temperature})
	if err != nil {
		return fmt.Errorf("montar corpo da requisição: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("montar requisição: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return ctxErr
		}
		if isUnreachableErr(err) {
			return fmt.Errorf("não foi possível conectar em %s: %w", c.baseURL, ErrUnreachable)
		}
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return newAPIErrorFromResponse(resp)
	}

	return readSSEStream(ctx, resp, onChunk)
}

func readSSEStream(ctx context.Context, resp *http.Response, onChunk func(string)) error {
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), maxSSELineBytes)

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		if strings.HasPrefix(line, ":") {
			continue // comentário / keep-alive
		}
		if !strings.HasPrefix(line, "data:") {
			continue
		}

		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "" {
			continue
		}
		if data == "[DONE]" {
			return nil
		}

		var chunk sseChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}
		if chunk.Error != nil {
			return &APIError{Status: resp.StatusCode, Message: chunk.Error.Message}
		}
		if len(chunk.Choices) == 0 {
			continue
		}
		content := chunk.Choices[0].Delta.Content
		if content == "" {
			continue
		}
		if ctxErr := ctx.Err(); ctxErr != nil {
			return ctxErr
		}
		onChunk(content)
	}

	if err := scanner.Err(); err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return ctxErr
		}
		return fmt.Errorf("ler stream: %w", err)
	}

	if ctxErr := ctx.Err(); ctxErr != nil {
		return ctxErr
	}

	// Alguns servidores encerram a conexão sem enviar "data: [DONE]".
	return nil
}

func newAPIErrorFromResponse(resp *http.Response) *APIError {
	const maxReadBytes = 8 * 1024
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, maxReadBytes))

	var parsed errorResponseBody
	if err := json.Unmarshal(raw, &parsed); err == nil && parsed.Error.Message != "" {
		return &APIError{Status: resp.StatusCode, Message: parsed.Error.Message}
	}

	snippet := strings.TrimSpace(string(raw))
	if len(snippet) > maxErrorBodySnippet {
		snippet = snippet[:maxErrorBodySnippet]
	}
	if snippet == "" {
		snippet = http.StatusText(resp.StatusCode)
		if snippet == "" {
			snippet = strconv.Itoa(resp.StatusCode)
		}
	}
	return &APIError{Status: resp.StatusCode, Message: snippet}
}

// isUnreachableErr identifica erros de rede que impedem qualquer conexão com
// o servidor (porta fechada, DNS não resolvido, recusa de conexão etc), em
// oposição a erros de contexto (cancelamento/timeout) ou erros HTTP.
func isUnreachableErr(err error) bool {
	var opErr *net.OpError
	if errors.As(err, &opErr) {
		return true
	}
	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) {
		return true
	}
	return false
}
