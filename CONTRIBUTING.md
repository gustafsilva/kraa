# Contribuindo com o Prompt Improve

Obrigado pelo interesse! Correções, documentação, novas ações padrão e melhorias de suporte a
plataformas são bem-vindas.

O guia completo está no site: **[Contribuir](https://gustafsilva.github.io/prompt-improve-beta/docs/contribuir/ambiente/)**
(ambiente, arquitetura, testes e release). O resumo:

## Ambiente

- Go 1.25+, Node.js 22+ e a CLI do Wails v3 na versão do `go.mod`:
  `go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-beta.26`
- Linux: `sudo apt install build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev xdotool`
  e `-tags gtk3` em todo comando `go` direto.

```bash
npm --prefix frontend ci
wails3 dev
```

## Antes de abrir o PR

```bash
go test ./...                 # Linux: go test -tags gtk3 ./...
npm --prefix frontend test
npm --prefix npm test
npm --prefix site run build   # se mudou a documentação
```

## Regras

- **TDD:** escreva o teste, veja falhar, implemente, veja passar.
- `internal/config`, `internal/llm`, `internal/improver` e `internal/platform/capture.go` não
  importam o Wails.
- Código específico de SO usa build tags, nunca `if runtime.GOOS` espalhado.
- Textos da UI em PT-BR; identificadores e código em inglês.
- Commits no formato [Conventional Commits](https://www.conventionalcommits.org/pt-br/)
  (`feat(frontend): …`, `fix(ci): …`, `docs: …`).
- Mudanças visíveis ao usuário entram na seção "Não lançado" do `CHANGELOG.md` e na documentação
  em `site/src/content/docs/`.

## Fluxo

1. Para mudanças grandes, abra uma issue antes de codar.
2. Crie um branch a partir de `main`.
3. Abra o PR preenchendo o template, incluindo em quais SOs o checklist manual foi feito.

Ao participar, você concorda com o [Código de conduta](CODE_OF_CONDUCT.md).
