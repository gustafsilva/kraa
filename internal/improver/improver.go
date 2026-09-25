// Package improver monta as mensagens de chat (system + user) a partir de
// uma ação pré-configurada e/ou uma instrução livre, e delega o streaming da
// resposta a um internal/llm.Client. Não importa o Wails.
package improver

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/gustavofreitas/prompt-improve/internal/config"
	"github.com/gustavofreitas/prompt-improve/internal/llm"
)

// systemPrompt é a mensagem de sistema fixa enviada em toda chamada ao LLM.
const systemPrompt = "Você reescreve textos. Responda SOMENTE com o texto final, sem aspas, sem explicações, no mesmo idioma do texto original salvo instrução contrária."

// Erros de validação de Request, retornados antes de qualquer chamada ao
// LLM. As mensagens estão em PT-BR pois podem ser exibidas diretamente na
// UI.
var (
	// ErrEmptyText indica que o texto (após TrimSpace) está vazio.
	ErrEmptyText = errors.New("improver: o texto não pode ser vazio")

	// ErrTooLong indica que o texto excede config.Config.MaxInputChars.
	ErrTooLong = errors.New("improver: o texto excede o tamanho máximo permitido")

	// ErrUnknownAction indica que Request.ActionID foi informado mas não
	// corresponde a nenhuma ação em config.Config.Actions.
	ErrUnknownAction = errors.New("improver: ação desconhecida")

	// ErrNoInstruction indica que nem ActionID nem FreeInstruction foram
	// informados: não há o que instruir o LLM a fazer.
	ErrNoInstruction = errors.New("improver: informe uma ação ou uma instrução")
)

// Request descreve um pedido de melhoria de texto: o texto original, o id
// de uma ação pré-configurada (opcional) e/ou uma instrução livre
// (opcional). Pelo menos uma das duas precisa ser informada.
type Request struct {
	Text            string
	ActionID        string
	FreeInstruction string
}

// Improver monta mensagens de chat a partir de uma Request e roda o stream
// através de um llm.Client.
type Improver struct {
	cfg *config.Config
	llm llm.Client
}

// New cria um Improver que valida as requisições contra cfg e delega o
// streaming a c.
func New(cfg *config.Config, c llm.Client) *Improver {
	return &Improver{cfg: cfg, llm: c}
}

// Run valida r, monta as mensagens de chat e chama i.llm.Stream,
// encaminhando cada chunk recebido a onChunk. Nenhuma chamada a onChunk
// ocorre depois que ctx é cancelado, e Run retorna ctx.Err() (por exemplo
// context.Canceled) sempre que o contexto foi cancelado, mesmo que o
// cliente LLM tenha retornado um erro diferente.
func (i *Improver) Run(ctx context.Context, r Request, onChunk func(string)) error {
	msgs, err := i.buildMessages(r)
	if err != nil {
		return err
	}

	streamErr := i.llm.Stream(ctx, msgs, func(chunk string) {
		if ctx.Err() != nil {
			return
		}
		onChunk(chunk)
	})

	if ctxErr := ctx.Err(); ctxErr != nil {
		return ctxErr
	}
	return streamErr
}

// buildMessages valida r contra i.cfg e monta as mensagens de chat (system
// + user). A validação ocorre nesta ordem: texto vazio, texto longo demais,
// ação desconhecida, nem ação nem instrução livre informadas.
func (i *Improver) buildMessages(r Request) ([]llm.Message, error) {
	text := strings.TrimSpace(r.Text)
	if text == "" {
		return nil, ErrEmptyText
	}
	if i.cfg.MaxInputChars > 0 && utf8.RuneCountInString(text) > i.cfg.MaxInputChars {
		return nil, ErrTooLong
	}

	var (
		action    config.Action
		hasAction bool
	)
	if r.ActionID != "" {
		a, ok := i.cfg.Action(r.ActionID)
		if !ok {
			return nil, ErrUnknownAction
		}
		action = a
		hasAction = true
	}

	free := strings.TrimSpace(r.FreeInstruction)
	if !hasAction && free == "" {
		return nil, ErrNoInstruction
	}

	var b strings.Builder
	if hasAction {
		b.WriteString(action.Instruction)
	}
	if free != "" {
		if b.Len() > 0 {
			b.WriteString("\n")
		}
		b.WriteString("Instrução adicional: ")
		b.WriteString(free)
	}
	if b.Len() > 0 {
		b.WriteString("\n\n")
	}
	b.WriteString("<texto>\n")
	b.WriteString(text)
	b.WriteString("\n</texto>")

	return []llm.Message{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: b.String()},
	}, nil
}

// fenceRe casa um texto totalmente envolto por uma única cerca ```, com
// tag de linguagem opcional na linha de abertura (ex.: "```go\n...\n```").
var fenceRe = regexp.MustCompile("(?s)^```[^\n]*\n(.*)\n```$")

// quotePairs são os pares de aspas que Clean remove quando envolvem o
// texto inteiro: aspas retas duplas, aspas retas simples, aspas curvas e
// aspas francesas (guillemets).
var quotePairs = [][2]string{
	{`"`, `"`},
	{`'`, `'`},
	{"“", "”"},
	{"«", "»"},
}

// Clean normaliza a saída do LLM: remove espaços nas bordas, uma única
// cerca ``` (com tag de linguagem opcional) quando ela envolve o texto
// inteiro, e um único par de aspas de abertura/fechamento quando envolvem
// o texto inteiro. Não tenta remover preâmbulos como "Aqui está o texto:".
// Clean não é chamado dentro de Run; quem acumula o stream chama Clean no
// resultado final.
func Clean(s string) string {
	s = strings.TrimSpace(s)

	if m := fenceRe.FindStringSubmatch(s); m != nil {
		s = strings.TrimSpace(m[1])
	}

	for _, p := range quotePairs {
		open, close := p[0], p[1]
		if len(s) < len(open)+len(close) || !strings.HasPrefix(s, open) || !strings.HasSuffix(s, close) {
			continue
		}
		inner := s[len(open) : len(s)-len(close)]
		// Only strip when the interior doesn't itself contain the pair's
		// opening or closing quote character: otherwise the text has more
		// than one quoted span (e.g. `"a" e "b"`) and stripping the outer
		// characters would corrupt it instead of unwrapping a single
		// wrapping pair.
		if strings.Contains(inner, open) || strings.Contains(inner, close) {
			continue
		}
		s = strings.TrimSpace(inner)
		break
	}

	return s
}
