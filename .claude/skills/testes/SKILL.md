---
name: testes
description: Use quando for criar, corrigir, revisar ou manter testes no Kraa (Go, frontend Vitest, CLI npm, E2E Playwright) — teste para uma mudança de código, teste flaky ou intermitente, warning de act(), mock de binding desatualizado, cobertura abaixo do threshold, nova spec E2E, fakes duplicados ou um comportamento que parece impossível de testar automaticamente.
argument-hint: "[o que testar, ex.: rollback do atalho no reload]"
---

# Testes do Kraa

Um teste vale pelo que ele prova sobre o comportamento que o usuário vê, não pela linha que
cobre. Cada mudança entra na camada **mais baixa que ainda prova o comportamento**, e o que
nenhuma camada alcança vai documentado, não fica sem registro.

**REQUIRED SUB-SKILL:** `superpowers:test-driven-development` (teste primeiro, ver falhar,
implementar, ver passar). Teste escrito para código existente que falha de primeira é
**bug real**: investigue com `superpowers:systematic-debugging`, não ajuste a asserção.

Antes de usar uma API do Wails v3, Playwright, Vitest ou ESLint que não esteja nesta skill,
consulte a doc via **context7**. Snippets por camada: `references/padroes.md`. Fontes externas:
`references/fontes.md`.

## Onde testar

| A mudança é em… | Camada | Onde | Comando |
|---|---|---|---|
| Regra pura (config, prompt, parsing, SSE, decisão de sessão) | Unitário Go | `internal/**/*_test.go` | `go test ./internal/<pkg>/` |
| Código por SO (`keys_*.go`, `session_linux.go`) | Unitário Go com build tag | `*_linux_test.go` etc.; a lógica vai numa função pura sem tag | `GOOS=linux CGO_ENABLED=0 go vet ./internal/platform/` no macOS; roda de verdade no job do SO |
| Orquestração no `ImproveService`, reload, atalho, fila de instância | Unitário Go com fakes | `internal/app/*_test.go` (harness `newHarness`) | `go test -race ./internal/app/` |
| Service → improver → cliente HTTP real | Integração Go | `internal/app/integration_test.go` + `internal/llmfake` | `go test -race ./internal/app/ -run Integration` |
| Componente, hook ou tela do modal/perfil | Vitest + Testing Library | `frontend/src/**/*.test.tsx` | `npm --prefix frontend test` |
| Instalador ou subcomando da CLI | Vitest (npm) | `npm/test/*.test.ts` | `npm --prefix npm run coverage` |
| Fluxo ponta a ponta (frontend real ↔ Go real ↔ LLM) | E2E Playwright | `e2e/tests/*.spec.ts` | `npm --prefix e2e run build:server && npm --prefix e2e test` |
| Depende do SO real (atalho global, bandeja, colagem noutro app, WebView de produção) | Manual | tabela "O que não tem teste automatizado" + checklist em `site/src/content/docs/contribuir/testes.mdx` | — |

Regra de escolha: um E2E só entra quando o valor está na **integração** (evento pelo
WebSocket, binding real, `config.yaml` gravado). Variações de regra (cada status HTTP, cada
ação) ficam em tabela no unitário; o E2E cobre um caminho feliz e um de erro.

Lógica presa em closure do `main.go` não é testável: extraia para um tipo em `internal/app`
com interface pequena que o tipo do Wails já satisfaz (ex.: `Shortcuts`), sem adapter.

## Verificação antes de commitar

```bash
go test -race ./...                 # Linux: go test -race -tags gtk3 ./...
go test -coverprofile=/tmp/kraa-cover.out ./internal/... && go tool cover -func=/tmp/kraa-cover.out | tail -1   # >= 87%
npm --prefix frontend run typecheck && npm --prefix frontend run lint && npm --prefix frontend run coverage
npm --prefix npm run typecheck && npm --prefix npm run coverage
npm --prefix e2e run build:server && npm --prefix e2e test      # se tocou fluxo coberto por E2E
```

Teste novo que envolve concorrência ou tempo: rode `-count=5` (Go) ou
`--repeat-each=5` (Playwright) antes de declarar pronto. Use
`superpowers:verification-before-completion`.

## Regras por camada

**Go**
- Table-driven com `t.Run(tc.name, …)` para variações (modelo: `TestRunnerErrorsBecomePTBRErrorEvents`
  em `internal/app/service_test.go:355`). Mensagem de falha diz `got` e `want`.
- Dependências do SO atrás de interface ou função injetada: `Clipboard`, `KeySender`,
  `Window`, `Shortcuts`, `Runner`, `getenv`/`lookPath` (`internal/platform/session.go:14`).
  No pacote `app`, reuse `newHarness` e seus fakes; não crie fakes paralelos.
- HTTP/SSE: `httptest.NewServer` com `writeSSE` (`internal/llm/client_test.go:20`) ou
  `internal/llmfake` (cenários, requisições gravadas, cancelamento visível).
- Tempo e goroutines: `testing/synctest` (`synctest.Test` + `synctest.Wait`), nunca
  `time.Sleep`. Dentro de uma bolha não use rede real (I/O de rede não é *durably blocking*):
  com `httptest`, sincronize por canal `done` fechado pelo fake ou por polling com prazo.
  Ao escrever ou mudar um plano/brief de teste, prescreva o mecanismo de espera.
- `t.Parallel()` só em teste sem `t.Setenv`, HOME, arquivo compartilhado ou estado global
  (com `t.Setenv` o Go entra em pânico). Hoje `internal/` não usa paralelo; não é meta.
- Isolamento de disco: `t.TempDir()` e `t.Setenv("HOME", …)`; nunca o `config.yaml` real.
- Build tags: `_darwin_test.go`/`_linux_test.go`/`_windows_test.go`; no Linux tudo com
  `-tags gtk3`; nunca `if runtime.GOOS` novo no teste.
- Fuzz (`FuzzXxx` com `f.Add` de sementes) só para parsers de entrada externa (SSE, YAML);
  golden files em `testdata/` só se a saída for grande e estável.

**Frontend (Vitest + Testing Library)**
- Query por papel e nome acessível: `getByRole("button", { name: /Substituir/ })`,
  `getByRole("textbox", { name: "Texto a melhorar" })`. `getByTestId` só sem alternativa.
  Nomes em PT-BR, iguais aos da UI.
- Interação com `const user = userEvent.setup()` antes do render e `await user.…` **fora** de
  `act()`. Evento vindo do Go: `act(() => emit("improve:chunk", {...}))`.
- O runtime do Wails e o binding `ImproveService` já são mocks globais (alias no
  `vitest.config.ts` → `src/test/wailsRuntimeMock.ts`, `src/test/improveServiceMock.ts`);
  o `setup.ts` faz `mockReset` + defaults depois de cada teste. **Nunca** `vi.mock` desses
  módulos por arquivo; por teste use `ImproveService.X.mockResolvedValueOnce(...)`.
- O mock é tipado com `satisfies Record<keyof typeof RealService, unknown>`: mudou método no
  Go → `wails3 generate bindings -ts` → `npm run typecheck` aponta o mock a atualizar.
- Zero warnings de `act()` na saída: warning é bug do teste (estado mudando depois da
  asserção), não ruído. Esperas assíncronas com `findBy…`/`waitFor`, nunca `setTimeout`.
- Um arquivo por `describe` grande; helpers compartilhados num `helpers.tsx`.

**CLI npm**
- Tudo por injeção: `run(args, deps)` com `CliDeps` falso via `deps(over)` e HOME temporário
  (`npm/test/cli.test.ts`). `fetch`, `exec`, `spawnDetached`, `commandExists` são `vi.fn`.
- Processo real só no teste de `exec.ts` (com `process.execPath`). Nunca download real.

**E2E (Playwright)**
- Alvo: `bin/kraa-e2e` (`main_server.go`, `-tags server`) + `cmd/llmfake`, dirigidos por
  `/__e2e/*` (`trigger`, `state`, `session`, `clipboard`, `reset`) e `/__control/*`.
- `workers: 1` (um backend e um `config.yaml`); toda spec usa o fixture `openModal`, que
  roda `resetAll()` e espera o console `Event WebSocket connected` antes do `trigger`.
- Locators por papel; asserções *web-first* (`await expect(locator).toBeVisible()`); estado
  do backend com `expect.poll(...)`. Nunca `waitForTimeout` nem `expect(await x.isVisible())`.
- `trace: "retain-on-failure"`; `retries: 1` só no CI e teste que só passa no retry é flaky.
- Fatos do server mode e armadilhas: `references/padroes.md#e2e`.

## Manutenção

**Teste flaky** (passa e falha sem mudança de código):
1. Reproduza: `go test -race -count=20 -run TestX ./pkg/` ou
   `npx playwright test x.spec.ts --repeat-each=10 --workers=1`; abra o trace.
2. Classifique a causa: espera por tempo, estado vazando entre testes, ordem de goroutines,
   evento antes do listener (WebSocket), recurso real (rede, clipboard, HOME).
3. Corrija a causa (synctest, canal `done`, `expect.poll`, reset, fake). Aumentar timeout ou
   pôr retry não é correção.
4. Se não der para corrigir agora: `t.Skip("flaky: <issue>")`/`test.fixme` com issue aberta e
   prazo; nunca apagar em silêncio.

**Binding mudou**: regenere os bindings, rode `npm --prefix frontend run typecheck`, atualize
`improveServiceMock.ts` (método + default em `applyDefaults`) e o fake em `internal/e2e` se
o E2E usa o método.

**Cobertura**: thresholds em `frontend/vitest.config.ts`, `npm/vitest.config.ts` e o gate
Go de 87% no `ci.yml`. Só sobem, arredondando para baixo o novo piso medido; nunca baixe
para a CI passar. Cobertura é piso, não meta: não escreva teste só para pintar linha.

**Redundância**: dois testes que falham sempre juntos pela mesma razão viram um (ou uma
linha de tabela). Apague teste que só verifica que o mock foi chamado com o que o próprio
teste configurou. Mudança de comportamento atualiza o teste no mesmo commit.

**Ficou impossível de testar** (API do SO, janela nativa, no-op do server mode): acrescente a
linha na tabela "O que não tem teste automatizado" e o item no checklist manual de
`site/src/content/docs/contribuir/testes.mdx`, dizendo qual parte os unitários cobrem.

## Checklist de revisão de testes

Marque cada item; qualquer "não" bloqueia.

- [ ] Existe teste que falhava antes da mudança (TDD) e ele afirma o comportamento, não a implementação.
- [ ] Nada de `time.Sleep`/`setTimeout`/`waitForTimeout` **fixo** para "dar tempo" ou provar
  que nada aconteceu (ex. real: `internal/app/service_test.go:277/308/345/396`,
  `internal/autostart/toggle_test.go:90/104`). OK: polling até uma condição com prazo
  (`waitFor`, `expect.poll`, loop com deadline) quando há rede ou processo real no meio. Só
  goroutines/canais → `synctest.Wait()`.
- [ ] Fake HTTP compartilhado (`internal/llmfake`, fakes de `/__e2e/*`) confere paths e formato
  do JSON com o cliente real que o consome (`internal/llm/client.go`, `models.go`).
- [ ] Cada teste tem asserção sobre saída observável (evento, DOM, arquivo, requisição). Só
  `toHaveBeenCalled` do próprio mock não conta.
- [ ] Seletores por papel/label/texto, nunca por classe CSS ou estrutura do DOM.
- [ ] Sem `vi.mock("@wailsio/runtime")` ou do binding no arquivo; sem `mockClear` onde a
  implementação precisa ser zerada (`mockReset`; `vi.restoreAllMocks` não reseta `vi.fn`).
- [ ] Sem estado vazando: HOME/`t.TempDir`, listeners, `config.yaml` do E2E via `resetAll()`.
- [ ] `await user.…` fora de `act()` (ex. real a corrigir: `frontend/src/App.test.tsx:114`);
  saída do Vitest sem warning de `act()`.
- [ ] Fakes reusados do harness do pacote; nenhum `fakeClipboard`/`fakeKeys` novo duplicado.
- [ ] Código por SO testado via função pura sem tag + teste com build tag; nada de `runtime.GOOS`.
- [ ] npm: nenhuma rede/processo real fora do teste de `exec.ts`.
- [ ] E2E: fixture `openModal`, `expect.poll` para estado do backend, sem `workers > 1`.
- [ ] Thresholds iguais ou maiores; limitação nova registrada na tabela + checklist manual.
- [ ] Strings de UI/erro nas asserções em PT-BR; identificadores em inglês.

## Racionalizações comuns

| Desculpa | Realidade |
|---|---|
| "O sleep de 50 ms resolve" | Resolve na sua máquina. No CI com `-race` vira flaky. Use synctest/`expect.poll`. |
| "Baixo o threshold só dessa vez" | O piso existe para isso. Escreva o teste ou explique na PR por que a linha não é testável. |
| "O teste falhou, ajusto o esperado" | Em código existente, falha de primeira é bug. Depure antes. |
| "Mock local é mais rápido de escrever" | Mock por arquivo diverge do binding e vaza estado. Use o global. |
| "Isso só dá para testar à mão" | Extraia a decisão para uma função com dependências injetadas; o resto vai para o checklist. |

## Aprendizados do projeto

Sessões futuras acrescentam aqui o que descobriram (data, fato, arquivo). Não apague itens;
marque os obsoletos como `(obsoleto: motivo)`.

- 2026-09-27: medição inicial de cobertura: Go `internal/...` 86.3%, frontend
  92.4/87.2/90.1/92.8, npm 84.7/82.6/71.2/86.1. Thresholds partem desses pisos.
- 2026-09-27: testing-library só registra o `cleanup` automático com `globals: true` no
  Vitest; sem isso o DOM de um teste vaza para o próximo.
- 2026-09-27: `eslint-disable` sem ESLint rodando é comentário morto; o lint roda na CI.
- 2026-09-27: medir cobertura numa cópia no scratchpad antes de instalar dependências no repo.
- 2026-09-27: tarefas de teste em paralelo só com arquivos disjuntos, uma worktree por
  tarefa, merge sequencial rodando os três comandos de teste após cada merge.
- 2026-09-27 (Onda 1): polling com prazo é aceitável com rede/processo real; sleep fixo não.
  Fakes HTTP quebram a integração em silêncio quando o path ou o JSON divergem do cliente real.
- 2026-09-27 (Onda 1): plano ou brief de teste deve prescrever o mecanismo de espera
  (synctest, canal `done`, `expect.poll`); implementação ao pé da letra herda o anti-padrão.
