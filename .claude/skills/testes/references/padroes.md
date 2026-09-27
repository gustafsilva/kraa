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

Referência: `newHarness(t, runner, session)` em `internal/app/service_test.go:166`. Agrega
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

### Fakes e concorrência

Fake que recebe um callback precisa guardá-lo e dispará-lo em pelo menos um teste — só assim
uma fiação errada (accelerator certo, callback errado) aparece. Copie a lista sob o lock e
chame fora dele: o callback pode reentrar (`Register`/`Reload`).

```go
// internal/e2e/e2e.go — padrão correto: guarda e dispara fora do lock.
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

Contraexemplo ainda no repo: `internal/app/reloader_test.go:26` —
`func (f *fakeShortcuts) Register(a string, _ func()) error` descarta o callback; nenhum
teste desse fake prova que o hotkey certo dispara o efeito certo.

Teste "de concorrência" que só roda goroutines sob `-race` sem afirmar nada é vácuo:
`TestReloadsAreSerialized` (`internal/app/reloader_test.go:226`) dispara 8 `Reload()` e só
espera o `WaitGroup` — não prova exclusão nem ordem. Para provar de verdade, acrescente um
contador ou lista protegida por um segundo mutex e afirme sobre ela (ex.: nenhum reload viu
config parcialmente escrita, ou a ordem de aplicação bate com a ordem de chamada).

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
  assim que a Task 8 achou um bug real de produto. Semeie sempre (ver `setClipboard` na spec
  abaixo, antes do `trigger`).
- `/__e2e/reset` cancela o stream em andamento (`Close`) **antes** de limpar os fakes
  (`internal/e2e/e2e.go`), senão o próximo teste herda eventos do anterior. Para provar essa
  ordem, use um efeito que só fica no estado esperado se o cancelamento rodou primeiro (ex.:
  um contador que o `Close` incrementa), não apenas "`Close` foi chamado".
- `trigger` sem seleção espera o `CaptureWait` inteiro (`defaultCaptureWait`,
  `internal/app/service.go:34`, 400 ms): dê esse tempo ao timeout do teste.
- Tag de build nova para um seam de teste: confira o Taskfile/Docker antes de escolher — a
  tag `server` já é usada em `build:server`/`build:docker`; colidir quebra o deploy real.

### Spec

```ts
import { e2eState, setClipboard, trigger } from "../support/api";
import { expect, test } from "../support/fixtures";

test("Enter em Substituir cola o resultado e restaura o clipboard", async ({ page, request, openModal }) => {
  await openModal(); // resetAll() + espera o WebSocket
  await setClipboard(request, "clipboard do usuário");
  await trigger(request, "abc");
  await page.getByRole("option", { name: "Melhorar prompt" }).click();
  await expect(page.getByText("Texto melhorado pelo fake.")).toBeVisible();
  await page.keyboard.press("Enter");

  await expect.poll(async () => (await e2eState(request)).pasted).toEqual(["Texto melhorado pelo fake."]);
  expect((await e2eState(request)).clipboard).toBe("clipboard do usuário");
});
```

Depuração: `npx playwright test x.spec.ts --project=chromium --trace on` e
`npx playwright show-report` (ou `show-trace` no zip de `test-results/`).
