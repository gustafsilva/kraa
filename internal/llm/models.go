package llm

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
)

// maxModelsBodyBytes limita o corpo lido de GET /models.
const maxModelsBodyBytes = 1024 * 1024

type modelsResponse struct {
	Data []struct {
		ID string `json:"id"`
	} `json:"data"`
}

// ListModels consulta GET {baseURL}/models (formato OpenAI; no Ollama lista
// os modelos instalados) e devolve os ids em ordem alfabética, sem repetição.
// Os erros seguem os de Stream: ErrUnreachable (via errors.Is) e *APIError.
func ListModels(ctx context.Context, baseURL, apiKey string) ([]string, error) {
	baseURL = strings.TrimRight(baseURL, "/")
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/models", nil)
	if err != nil {
		return nil, fmt.Errorf("montar requisição: %w", err)
	}
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return nil, ctxErr
		}
		if isUnreachableErr(err) {
			return nil, fmt.Errorf("não foi possível conectar em %s: %w", baseURL, ErrUnreachable)
		}
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, newAPIErrorFromResponse(resp)
	}

	var body modelsResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxModelsBodyBytes)).Decode(&body); err != nil {
		return nil, fmt.Errorf("resposta inválida de %s/models: %w", baseURL, err)
	}

	seen := make(map[string]struct{}, len(body.Data))
	ids := make([]string, 0, len(body.Data))
	for _, m := range body.Data {
		if m.ID == "" {
			continue
		}
		if _, dup := seen[m.ID]; dup {
			continue
		}
		seen[m.ID] = struct{}{}
		ids = append(ids, m.ID)
	}
	sort.Strings(ids)
	return ids, nil
}
