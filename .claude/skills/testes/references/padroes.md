# Padrões por camada (snippets no estilo do repo)

Prefira copiar o arquivo de referência citado a partir destes trechos.

## Go

### Função pura + wrapper fino por SO

Referência: `internal/platform/session.go:14` (sem build tag, testada em todos os SOs);
`session_linux.go` só liga `os.Getenv`/`exec.LookPath`.

```go
func TestDetectLinuxSession(t *testing.T) {
	found := func(string) (string, error) { return "/usr/bin/xdotool", nil }
	missing := func(string) (string, error) { return "", exec.ErrNotFound }
	cases := []struct {
		name     string
		env      map[string]string
		lookPath func(string) (string, error)
		want     Session
	}{
		{"wayland", map[string]string{"XDG_SESSION_TYPE": "wayland"}, found, Session{Reason: reasonWayland}},
		{"x11 sem xdotool", map[string]string{"XDG_SESSION_TYPE": "x11"}, missing, Session{Reason: reasonXdotool}},
		{"x11 com xdotool", map[string]string{"XDG_SESSION_TYPE": "x11"}, found, Session{CanSimulateKeys: true}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := detectLinuxSession(func(k string) string { return tc.env[k] }, tc.lookPath)
			if got != tc.want {
				t.Fatalf("got %+v, want %+v", got, tc.want)
			}
		})
	}
}
```

O mesmo vale para processos externos: `xdotoolKeyWith(run, combo)` recebe o construtor de
`*exec.Cmd` e o teste `_linux_test.go` confere os argumentos sem rodar `xdotool`.

### Harness do `internal/app`

Referência: a função `newHarness(t, runner, session)` em `internal/app/service_test.go`. Agrega
`fakeEmitter` (com `waitFor`), `fakeClipboard`, `fakeKeys`, `fakeWindow` e `recorder`, e
injeta `Sleep`, `CaptureWait` e `PasteSettle` para a sequência ficar determinística. Teste
novo do pacote usa o harness; se faltar um fake, acrescente-o ao harness.

```go
h := newHarness(t, fakeRunner{run: func(ctx context.Context, r improver.Request, onChunk func(string)) error {
	onChunk("Olá")
	return nil
}}, canSimulate)
id, _ := h.svc.Start(StartRequest{Text: "oi", ActionID: "fix"})
ev := h.em.waitFor(t, isEvent(EventDone, id))
```

### Ausência de evento com `testing/synctest` (Go 1.25)

```go
func TestCancelStopsRequestWithoutFurtherEvents(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		h := newHarness(t, blockingRunner(), canSimulate)
		id, _ := h.svc.Start(StartRequest{Text: "x", ActionID: "fix"})
		h.svc.Cancel(id)
		synctest.Wait() // todas as goroutines da bolha bloqueadas: nada mais vai emitir
		for _, ev := range h.em.snapshot() {
			if eventID(ev) == id && ev.name != EventStarted {
				t.Fatalf("evento depois do Cancel: %+v", ev)
			}
		}
	})
}
```

Dentro da bolha o relógio é virtual (o `waitFor` com polling continua funcionando).
`httptest`/rede real não entra na bolha: nesses testes, o fake fecha um canal `done` e o
teste espera nele com `select` + prazo.

Exemplo real (não simplificado): `internal/app/service_test.go`'s
`TestCancelStopsRequestWithoutFurtherEvents` fecha um canal `finished` dentro do runner
fake e sincroniza o cancelamento com `select { case <-finished: ... case <-time.After(2s): t.Fatal(...) }`
*antes* do `synctest.Wait()` — é assim que o teste evita depender de timing real para provar
que nenhum evento chega depois do `Cancel`. `internal/autostart/toggle_test.go`'s
`TestToggleBurstFinalStateMatchesLastClickByGeneration` faz o mesmo com `sync.Mutex`
propositalmente fora do synctest (comentário no próprio arquivo, perto de
`TestToggleAppliesInClickOrderAndSkipsStaleResync`): 50 goroutines contendem de verdade pelo
mutex do `Toggler` porque quem detém o lock chama `time.Sleep`, e bloqueio em `sync.Mutex`
não é *durably blocked* — embrulhar esse teste em `synctest.Test` trava o relógio virtual
(reproduzido; ver o comentário no arquivo para a explicação completa).

### Fakes e concorrência

Fake que recebe um callback precisa guardá-lo e dispará-lo em pelo menos um teste — só assim
uma fiação errada (accelerator certo, callback errado) aparece. Copie a lista sob o lock e
chame fora dele: o callback pode reentrar (`Register`/`Reload`).

```go
// internal/e2e/e2e.go:143 — padrão correto: guarda e dispara fora do lock.
func (s *Shortcuts) Fire() int {
	s.mu.Lock()
	callbacks := make([]func(), 0, len(s.registered))
	for _, cb := range s.registered {
		callbacks = append(callbacks, cb)
	}
	s.mu.Unlock()
	for _, cb := range callbacks {
		cb()
	}
	return len(callbacks)
}
```

Exemplo a corrigir, ainda no repo: `internal/app/reloader_test.go:26` —
`func (f *fakeShortcuts) Register(a string, _ func()) error` descarta o callback; nenhum
teste desse fake prova que o hotkey certo dispara o efeito certo. Ao tocar esse arquivo,
troque o fake pelo padrão de `e2e.Shortcuts` acima.

Teste "de concorrência" que só roda goroutines sob `-race` sem afirmar nada é vácuo, outro
exemplo a corrigir: `TestReloadsAreSerialized` (`internal/app/reloader_test.go:239`) dispara
8 `Reload()` e só espera o `WaitGroup` — não prova exclusão nem ordem. Para provar de
verdade, acrescente um contador ou lista protegida por um segundo mutex e afirme sobre ela
(ex.: nenhum reload viu config parcialmente escrita, ou a ordem de aplicação bate com a
ordem de chamada).

### Asserções exatas, não substring

```go
done, ok := ev.data.(DoneEvent)
if !ok || done.Text != "Olá mundo" {
	t.Fatalf("data = %#v, want DoneEvent{Text: %q}", ev.data, "Olá mundo")
}
```

(`internal/app/integration_test.go:62`). `fmt.Sprint(ev.data)` + `strings.Contains` aceita
falso positivo por substring — só serve como rótulo de depuração, nunca como asserção final.

### Diretório existente, não caminho inexistente

Para testar a falha de criação quando o pai é um arquivo comum, `os.IsNotExist(err)` dá
`false` (o erro real é `ENOTDIR`, não "não existe"). Teste essa falha com um diretório
existente e somente leitura (crie e depois `os.Chmod(dir, 0o555)`), não com um caminho que
simplesmente não existe.

### Teste de permissão (chmod) pula em dois casos, não só um

`internal/config/config_test.go`'s `TestLoad_CannotCreateDefaultFile` faz `os.Chmod(dir, 0o500)`
para provar a falha de "não foi possível criar" e hoje só tem `if runtime.GOOS == "windows" { t.Skip(...) }`.
Falta o segundo skip: quando `os.Geteuid() == 0` (root, comum em container/devcontainer) o
kernel ignora permissões POSIX e o teste falha por motivo errado (cria o arquivo em vez de
falhar). Todo teste novo de `chmod`/permissão pula nos dois casos:

```go
if runtime.GOOS == "windows" {
	t.Skip("permissões POSIX")
}
if os.Geteuid() == 0 {
	t.Skip("root ignora permissões")
}
```

Ao tocar `TestLoad_CannotCreateDefaultFile`, acrescente o skip de root que falta hoje.

### HTTP/SSE

- Unitário do cliente: `httptest.NewServer` + `writeSSE(w, r, lines)`
  (`internal/llm/client_test.go:20`), que para quando o contexto da requisição cancela.
- Integração: `srv := httptest.NewServer(llmfake.New("fake-a"))`, `fake.SetScenario(...)`,
  `fake.Requests()` para ver modelo, mensagens e `Canceled`. "Ollama parado" = servidor
  fechado (`srv.Close()` antes do `Start`).

### Cobertura

```bash
go test -coverprofile=/tmp/kraa-cover.out ./internal/... && go tool cover -func=/tmp/kraa-cover.out | tail -1
go tool cover -html=/tmp/kraa-cover.out   # ver linhas descobertas
```

## Frontend

### Mocks globais (não repetir por arquivo)

- `vitest.config.ts` faz alias de `@wailsio/runtime` → `src/test/wailsRuntimeMock.ts` e do
  barrel `@bindings/.../internal/app` → `src/test/improveServiceMock.ts`.
- `improveServiceMock.ts`: um `vi.fn` por método, `satisfies Record<keyof typeof RealService, unknown>`,
  defaults em `applyDefaults()`, `resetImproveServiceMock()` faz `mockReset` + defaults.
- `setup.ts`: `afterEach(() => { resetWailsMock(); resetImproveServiceMock(); })`.

### Teste de componente com evento do Go

```tsx
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emit } from "../test/wailsRuntimeMock";
import { ImproveService } from "../test/improveServiceMock";

it("mostra os chunks no preview conforme chegam", async () => {
  const user = userEvent.setup();
  ImproveService.Start.mockResolvedValueOnce("req-1");
  render(<App />);
  act(() => emit("selection:new", { text: "Texto capturado", canReplace: true, warning: "" }));

  await user.type(screen.getByRole("combobox", { name: /buscar ação/i }), "melhore{Enter}");
  await waitFor(() => expect(ImproveService.Start).toHaveBeenCalled());

  act(() => emit("improve:chunk", { id: "req-1", delta: "Olá" }));
  expect(await screen.findByText("Olá")).toBeInTheDocument();
});
```

`userEvent` dentro de `act()` gera "environment not configured to support act"; `emit()`
fora de `act()` gera "not wrapped in act". Foco ou `fireEvent` soltos em teste de teclado
também geram warning: use `user.keyboard("{ArrowDown}{Enter}")`
(`frontend/src/components/ActionList.test.tsx`).

### Warnings de act() só aparecem com saída verbose

`npm --prefix frontend test` (o `npm test` padrão) **não imprime** warnings de `act()` — o
reporter default os engole. Para contá-los de verdade:

```bash
npx vitest run --reporter=verbose --silent=false 2>&1 | grep -c "not wrapped in act\|environment is not configured"
```

Meça a contagem real antes de fixar uma meta de "zero warnings" numa task/PR — um número de
memória ou de um brief antigo pode estar errado.

### Workaround que muda foco pode esconder o ramo que ele deveria testar

cmdk + React 18 + jsdom: quando outro elemento rouba o foco de um input do cmdk que ainda
está focado, o blur imperativo do cmdk escapa do `act()` que envolve a atualização de estado
que causou o roubo de foco, e o React acusa "not wrapped in act" mesmo com `await` — mesmo a
atualização acontecendo de fato dentro do `act()`. `frontend/src/app/helpers.tsx`'s
`blurActiveElement()` contorna isso dando blur no elemento focado *antes* de emitir
`improve:done`, e é usado por quase todo teste do arquivo. Efeito colateral: isso colapsa a
condição de foco do `App.tsx` (`!active || active === document.body ||
active.closest('[data-slot="action-list"]')`) para só os dois primeiros ramos — o terceiro
ramo (usuário 100% teclado que nunca saiu da busca do cmdk) deixa de ser exercitado por
qualquer teste que use o helper.

**Regra:** um workaround de teste que muda foco/estado antes da ação para calar um warning
troca o ramo exercitado. Confira no código de produção qual condição depende daquele estado e
mantenha pelo menos um teste no caminho real do usuário, contendo o warning com um spy de
`console.error` **escopado a esse teste** (filtrando só a mensagem esperada, nunca silenciando
tudo). Exemplo completo: `frontend/src/app/keyboard.test.tsx`'s "quando termina com o foco
ainda na busca (cmdk), o foco vai para Substituir mesmo assim" — o comentário nesse teste
explica a mecânica e como confirmar que ele de fato cobre o ramo (remover a cláusula `closest`
do `App.tsx` e ver esse teste falhar).

### Cleanup ao desmontar: conte no mock, não no componente

Teste de "desmonta e remove os listeners" afirma sobre `listenerCount(name)` do
`frontend/src/test/wailsRuntimeMock.ts` (`hooks/useImprove.test.ts`'s "desmontar remove os
listeners de eventos"): conta > 0 com o hook montado, `unmount()`, conta === 0 depois. Isso
prova o cleanup de verdade porque observa o mock, não o componente; e cada evento contado
precisa ser um que o hook realmente aplicaria se ainda estivesse ouvindo.

### "Foi chamado" não é "foi processado"

`waitFor(() => expect(mock).toHaveBeenCalled())` só prova que a chamada começou, não que a
`.then`/`.catch` que trata o resultado já rodou. Para um caminho tipo `models ?? []` ou
`.catch(() => setError(...))`, essa distinção importa: se o estado inicial já é `[]`, esperar
só pela chamada deixa passar até uma implementação que não trata `null` nenhuma vez.
`hooks/useImprove.test.ts`'s "ListModels null vira lista vazia" semeia `["a", "b"]` primeiro,
espera `result.current.models` virar esse valor (processado, não só chamado), *então* resolve
`null` e afirma que virou `[]` — só assim o teste prova o `?? []`, e não apenas o valor
inicial que o hook já tinha.

### Cobertura de linha em 100%: ignore documentado, nunca teste oco

Com `lines: 100` no threshold (`frontend/vitest.config.ts`), uma linha defensiva que não dá
para exercitar (branch impossível de forçar em teste) ganha uma exclusão explícita e
justificada, não um teste que só existe para pintar a linha:

```ts
/* v8 ignore next -- defensivo: <por que não dá para forçar isso em teste> */
```

### Teste de "filtro reseta o destaque" precisa de ≥2 itens sobreviventes

`components/ActionList.test.tsx`'s "mudar o filtro volta o destaque ao primeiro item" destaca
o segundo item (`↓`), filtra para um termo que **ainda deixa dois itens** na lista, e só então
afirma que `Enter` roda o primeiro (não o destacado antes do filtro). Com um único item
sobrevivente ao filtro, qualquer `Enter` acerta e o teste não prova nada sobre o reset do
destaque.

## CLI npm

Referência: `deps(over)` e `fakeInstalled(platform)` em `npm/test/cli.test.ts`.

```ts
it("start (macOS) usa open -a", async () => {
  fakeInstalled("darwin");
  const { d } = deps({ platform: "darwin", arch: "arm64" });
  await expect(run(["start"], d)).resolves.toBe(0);
  expect(d.spawnDetached).toHaveBeenCalledWith("open", ["-a", path.join(home, "Applications/Kraa.app")]);
});
```

Aqui o `toHaveBeenCalledWith` é a saída observável (o comando que a CLI dispara), não um
eco do que o teste configurou. Mensagens ao usuário se conferem por `out()`.

HOME é `fs.mkdtempSync` no `beforeEach` e apagado no `afterEach`.

### Ramo Windows sem gravar no disco real

`path.win32.join` (e afins) produz `C:\Users\...` mesmo rodando no macOS/Linux; o `fs` real
do Node interpreta essa string como um nome de arquivo com `\` literal e grava no cwd. Teste
de ramo Windows espia `fs` em vez de deixar a função escrever de verdade:

```ts
const writeFileSync = vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);
// ...roda o código do ramo win32...
expect(writeFileSync).toHaveBeenCalledWith(expect.stringContaining("C:\\Users\\Ana"), ...);
writeFileSync.mockRestore();
```

Referência: `npm/test/install.test.ts:108`, `npm/test/cli.test.ts:181`.

### Sem rede real, mesmo fechando um gap de cobertura

Wrapper fino de fetch (`(url, init) => fetch(url, init)`) testa-se com
`vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))`
(`npm/test/cli.test.ts:269`, `npm/test/install.test.ts:334`) — nunca abrindo um socket de
loopback fora do `exec.test.ts` (o único com processo real, via `process.execPath`).

## E2E

### Fatos do Wails server mode (beta.26, verificados rodando)

- `go build -tags server .` compila; no Linux sem cgo (`CGO_ENABLED=0`), sem GTK/Xvfb no CI.
- O frontend precisa estar buildado antes (`//go:embed all:frontend/dist`); senão a página
  vem vazia. `npm --prefix e2e run build:server` faz os dois.
- Config isolado por `HOME` + `XDG_CONFIG_HOME` + `APPDATA` (`os.UserConfigDir` por SO).
- No-ops: clipboard (Copiar falha), janelas, bandeja; `GlobalShortcut.Register` sempre
  erra (daí o `Shortcuts` fake em `internal/e2e`); single-instance erra;
  `ApplicationStarted` não dispara.
- Eventos vão por WebSocket `/wails/events`: espere o console
  `Event WebSocket connected` antes do `/__e2e/trigger`, senão `selection:new` se perde.
- Nunca clique "Substituir" num backend com `KeySender` real no macOS: manda ⌘V de verdade
  para o app em foco. O binário `-tags server` e `/__e2e/*` nunca entram em release.
- Fake de clipboard "vazio" (`has=false` depois do reset) muda a semântica do restore do
  `Capture`: sem semear o clipboard antes, o restore vira no-op e o teste não percebe — foi
  assim que a Task 8 esbarrou na ruling **R9** (limitação documentada, não bug novo; ver
  `internal/platform/capture.go` e `privacidade.mdx`). Semeie sempre (ver `setClipboard` na
  spec abaixo, antes do `trigger`).
- `/__e2e/reset` cancela o stream em andamento (`Close`) **antes** de limpar os fakes
  (`internal/e2e/e2e.go`), senão o próximo teste herda eventos do anterior. Para provar essa
  ordem, use um efeito que só fica no estado esperado se o cancelamento rodou primeiro (ex.:
  um contador que o `Close` incrementa), não apenas "`Close` foi chamado".
- `trigger` sem seleção espera o `CaptureWait` inteiro (`defaultCaptureWait`,
  `internal/app/service.go:34`, 400 ms): dê esse tempo ao timeout do teste.
- Tag de build nova para um seam de teste: confira o Taskfile/Docker antes de escolher — a
  tag `server` já é usada em `build:server`/`build:docker`; colidir quebra o deploy real.

### Colar registra antes de restaurar: afirme os dois juntos

`platform.Paste` cola e só depois restaura o clipboard (paste → sleep → restore); o fake de
`Keys.Paste` registra a colagem em `pasted` antes da restauração aparecer em `clipboard`.
Afirmar só um dos dois cedo demais é flaky. `e2e/tests/replace-copy.spec.ts`'s "Enter em
Substituir cola o resultado e restaura o clipboard" resolve isso com um único
`expect.poll` que devolve `{ pasted, clipboard }` e compara os dois de uma vez:

```ts
// Keys.Paste records the paste before platform.Paste's settle + restore,
// so poll both together until the clipboard is back to the user's value.
await expect
  .poll(async () => {
    const { pasted, clipboard } = await e2eState(request);
    return { pasted, clipboard };
  })
  .toEqual({ pasted: [RESULT], clipboard: "clipboard do usuário" });
```

### Sem teclas simuladas, o trigger lê o clipboard, não a seleção

Sessão sem permissão (`setSession(request, false, ...)`) impede o `Host.Trigger` de copiar a
seleção; ele pré-preenche o modal com o clipboard atual (`service.go:493`). Um teste desse
cenário precisa semear o clipboard antes de disparar, senão o campo fica vazio e a asserção
não prova nada — `replace-copy.spec.ts`'s "sem permissão de colar: Substituir some e o aviso
aparece" faz `setClipboard(request, "abc")` antes do `trigger`.

### Prove que a spec pega regressão

Depois de escrever uma spec nova, quebre a fiação de propósito (ex.: troque `OnHotkey` por um
callback vazio, ou pule uma etapa do fluxo) e rode a spec — ela tem que falhar. Só então
restaure o código e confirme que ela volta a passar. Uma spec que passa igual com a fiação
quebrada não está testando o que o nome promete.

### Typecheck do e2e/ usa o tsc do próprio pacote

```bash
e2e/node_modules/.bin/tsc -p e2e --noEmit
```

Não `npx tsc` nem o `tsc` da raiz do repo — o `e2e/tsconfig.json` e as `devDependencies` do
Playwright só resolvem a partir do `node_modules` de `e2e/`.

### Duas fontes de dado exigem valores distintos

Para provar de qual fonte um texto veio (seleção capturada vs. clipboard, perfil vs. sem
perfil), use um valor diferente em cada uma. Valores iguais não provam o ramo — o teste passa
mesmo se o código ler a fonte errada. Exemplo: `profile.spec.ts` usa "Sou tester E2E do Kraa"
só no perfil e confere com `.not.toContain` na chamada sem perfil.

### Efeito prometido no nome do teste vira contador de `/__e2e/state`

Se o nome do teste diz "fecha a janela" ou "cancela o stream", afirme o contador certo em
`e2eState()` (`window.hides`, `window.shows`), não só o que aparece no DOM — o `reset`
zera esses contadores, então `toBe(1)` prova mais do que `toBeGreaterThanOrEqual(1)` quando dá.
Hoje as specs usam `toBeGreaterThanOrEqual(1)` para `window.hides` (`cancel.spec.ts`,
`replace-copy.spec.ts`); ajuste para `toBe` se e quando o cenário garantir exatamente uma
ocorrência.

### `toHaveCount(0)` logo após a ação passa por acaso

`await expect(locator).toHaveCount(0)` executado logo depois de um clique pode passar porque
a UI ainda não assentou, não porque o elemento nunca vai aparecer. Ancore-o depois de um sinal
positivo (`await expect(page.getByText(...)).toBeVisible()` primeiro) ou confira o estado do
backend com `expect.poll`, como em `replace-copy.spec.ts` (`.toHaveCount(0)` só depois do
`expect(page.getByText(RESULT)).toBeVisible()` anterior no mesmo teste).

### Reset por fixture, não por convenção

Hoje toda spec chama `openModal()` manualmente e é essa chamada que roda `resetAll()`
(`e2e/support/fixtures.ts`) — nada no código impede uma spec nova de esquecer isso e herdar
estado de config/clipboard/backend da spec anterior. Prefira transformar o reset numa fixture
`{ auto: true }` (roda para toda spec do arquivo, mesmo sem ser pedida) da próxima vez que
`fixtures.ts` for tocado.

### Constantes do fake ficam em `e2e/support/`, nunca duplicadas

O texto fixo devolvido pelo LLM fake ("Texto melhorado pelo fake.") deveria viver como uma
constante em `e2e/support/env.ts` junto com `KRAA_URL`/`LLM_URL`/`CONFIG_YAML`. Hoje **não**
é assim: `improve.spec.ts` e `replace-copy.spec.ts` declaram cada um seu próprio
`const RESULT = "Texto melhorado pelo fake."`, e `keyboard.spec.ts`/`profile.spec.ts` repetem
a mesma string literal solta. Ao tocar qualquer uma dessas specs, mova a constante para
`e2e/support/` e reaponte todas.

### Spec completa de referência

O exemplo runnable, com a ordem paste→restore e o `expect.poll` dos dois juntos, está em
"Colar registra antes de restaurar" acima; copie de `e2e/tests/replace-copy.spec.ts`.

Depuração: `npx playwright test x.spec.ts --project=chromium --trace on` e
`npx playwright show-report` (ou `show-trace` no zip de `test-results/`).
