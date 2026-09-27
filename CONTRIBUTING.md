# Contribuindo com o Kraa

Obrigado pelo interesse! Toda ajuda conta, e você não precisa saber Go para contribuir.

## Primeira vez em open source?

Bem-vindo! Estes guias explicam o básico:

- [Como contribuir com open source](https://opensource.guide/pt/how-to-contribute/) (Open
  Source Guides, em português)
- [Contribuindo com um projeto](https://docs.github.com/pt/get-started/exploring-projects-on-github/contributing-to-a-project)
  (fork, branch e pull request no GitHub)

Se travar em qualquer etapa, pergunte nas
[Discussions](https://github.com/gustafsilva/kraa/discussions). Não existe pergunta boba.

## Formas de contribuir

| Contribuição | O que você precisa saber |
|---|---|
| Relatar um bug ou testar no seu sistema (macOS, Windows, Linux) | Nada de código: usar o app e descrever o que viu |
| Melhorar a documentação | Markdown (as páginas do site ficam em `site/src/content/docs/`, em MDX) |
| Criar uma ação padrão (ex.: um novo tipo de reescrita) | Escrever um bom prompt; Go básico para o teste |
| Frontend do modal | React + TypeScript |
| Backend, providers e integração com o sistema | Go |

## Como pegar uma issue

1. Procure issues com a label
   [`good first issue`](https://github.com/gustafsilva/kraa/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
   (boas para começar) ou
   [`help wanted`](https://github.com/gustafsilva/kraa/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22).
2. Comente na issue pedindo para ser atribuído e **espere a atribuição** antes de abrir o PR.
   Assim ninguém faz o mesmo trabalho em dobro.
3. Se a issue ficar **14 dias** sem atividade de quem a pegou, ela volta a ficar livre.
4. Tem uma ideia nova? Abra uma issue ou uma discussão **antes de codar**, para
   combinarmos a abordagem.

## Sua primeira contribuição, passo a passo

1. **Faça um fork** do repositório e clone o seu fork:

   ```bash
   git clone https://github.com/<seu-usuario>/kraa.git
   cd kraa
   ```

2. **Crie um branch** a partir de `main`:

   ```bash
   git switch -c docs/corrige-link-instalacao
   ```

3. **Prepare o ambiente.** Só documentação? Basta `npm --prefix site ci && npm --prefix site run dev`.
   Para o app, siga o guia
   [Ambiente de desenvolvimento](https://gustafsilva.github.io/kraa/docs/contribuir/ambiente/)
   (Go, Node e a CLI do Wails). O resumo:

   ```bash
   go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-beta.26
   npm --prefix frontend ci
   wails3 dev
   ```

   No Linux, instale antes as dependências de sistema e use a tag `gtk3` (veja o
   [guia de ambiente](https://gustafsilva.github.io/kraa/docs/contribuir/ambiente/)).

4. **Escreva o teste primeiro.** O projeto usa TDD: escreva o teste, veja falhar, implemente,
   veja passar. Veja [Testes](https://gustafsilva.github.io/kraa/docs/contribuir/testes/) e,
   se estiver usando um agente, a skill `.claude/skills/testes/` (`/testes`).
5. **Rode a verificação** (seção abaixo).
6. **Faça o commit** no formato [Conventional Commits](https://www.conventionalcommits.org/pt-br/):
   `feat(frontend): …`, `fix(llm): …`, `docs: …`.
7. **Abra o pull request** preenchendo o template, com `Fecha #<número da issue>`.

## Antes de abrir o PR

```bash
go test ./...                       # Linux: go test -tags gtk3 ./...
npm --prefix frontend test
npm --prefix frontend run coverage  # idem, com gate de cobertura
npm --prefix frontend run typecheck && npm --prefix frontend run lint
npm --prefix npm run coverage
npm --prefix e2e run build:server   # binário server mode + frontend
npm --prefix e2e test               # E2E (Playwright), se tocou fluxo coberto por ele
npm --prefix site run build         # se mudou a documentação
```

- Mudanças visíveis ao usuário entram na seção "Não lançado" do [`CHANGELOG.md`](CHANGELOG.md)
  e na documentação em `site/src/content/docs/`.
- Se a mudança afeta um sistema específico, diga no PR em quais sistemas você testou.

## Regras do projeto

- **Wails isolado:** só `main.go` e `internal/app` importam o Wails. `internal/config`,
  `internal/llm`, `internal/improver` e `internal/platform/capture.go` não.
- **Código por sistema operacional** usa build tags (`keys_darwin.go`, `keys_windows.go`,
  `keys_linux.go`), nunca `if runtime.GOOS` espalhado.
- **Idioma:** textos da interface em PT-BR; identificadores e código em inglês.

A [arquitetura](https://gustafsilva.github.io/kraa/docs/contribuir/arquitetura/) explica como
os pacotes se encaixam.

## Uso de IA

Pode usar assistentes de IA, mas **quem envia é responsável pelo que envia**:

- entenda e saiba explicar cada linha do seu PR;
- rode os testes localmente antes de abrir o PR;
- marque no template do PR se usou IA de forma relevante.

PRs claramente gerados sem revisão (código que não compila, testes que não rodam, mudanças
fora do escopo da issue) são fechados. Se usar um agente, o [`CLAUDE.md`](CLAUDE.md) do
repositório dá o contexto do projeto para ele.

## Revisão

Respondemos issues e PRs em **até 7 dias**. Se passar disso, comente no PR marcando o
mantenedor (@gustafsilva). Pedidos de ajuste fazem parte do processo e não são rejeição.

## Código de conduta e dúvidas

Ao participar, você concorda com o [Código de conduta](CODE_OF_CONDUCT.md). Dúvidas e ideias
vão para as [Discussions](https://github.com/gustafsilva/kraa/discussions); vulnerabilidades,
para o [SECURITY.md](SECURITY.md).
