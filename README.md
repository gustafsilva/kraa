# Prompt Improve

App de bandeja (macOS, Windows, Ubuntu) que melhora um texto selecionado em
qualquer aplicativo usando um LLM compatível com a API OpenAI (padrão:
Ollama local). Um atalho global captura a seleção, abre um modal com ações
pré-configuradas e um campo de instrução livre, e mostra o resultado em
streaming — para então **Substituir** o texto no app de origem ou
**Copiar**.

## O que é

```
 seleciona texto        aperta o atalho          escolhe ação
 em qualquer app   ──►  ⌘/Ctrl+Shift+Y     ──►   ou digita instrução
                        (captura via                 │
                         clipboard)                  ▼
                                              resposta em streaming
                                                      │
                              ┌───────────────────────┴───────────────────────┐
                              ▼                                               ▼
                    ⌘/Ctrl+Enter → Substituir                      ⌘/Ctrl+Shift+C → Copiar
                    (cola de volta no app de origem)                (vai para a área de transferência)
```

## Requisitos

- Um LLM compatível com a API OpenAI (`/v1/chat/completions`) acessível pela
  rede — por padrão, [Ollama](https://ollama.com) local.
- **macOS**: permissão de Acessibilidade (ver [Permissões e
  plataformas](#permissões-e-plataformas)).
- **Ubuntu (X11)**: [`xdotool`](https://github.com/jordansissel/xdotool)
  instalado para a colagem automática.
- **Ubuntu (Wayland)**: nenhuma dependência extra, mas sem colagem
  automática (ver abaixo).
- **Windows**: nenhum requisito adicional.
- Para compilar a partir do código: Go 1.24+, Node 22+ e a CLI do Wails v3
  (versão fixada no `go.mod`, `v3.0.0-beta.26`).

## Instalação do Ollama

```bash
# instala o Ollama (https://ollama.com/download) e baixa o modelo padrão
ollama pull llama3.2

# garante que o servidor está rodando (padrão: http://localhost:11434)
ollama serve
```

O Prompt Improve já vem configurado para conversar com esse servidor local,
sem precisar de `api_key`.

## Instalação rápida

> Em breve: `npm i -g prompt-improve`
>
> (pacote de instalação via npm ainda não publicado — ver Task 9 do plano em
> `.superpowers/sdd/2026-09-25-prompt-improve/`.)

## Build a partir do código

```bash
# 1. instala a CLI do Wails v3 (versão fixada no go.mod)
go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-beta.26

# 2. modo desenvolvimento (tray + hot reload do frontend)
wails3 dev

# 3. build de produção (binário em bin/)
wails3 build
```

No Linux, instale antes as dependências de build (Ubuntu/Debian):

```bash
sudo apt install build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev
```

No Linux o app é buildado com a tag de build `gtk3` (GTK3 + WebKit2GTK 4.1,
compatível com Ubuntu 22.04+), em vez do padrão do wails3 v3.0.0-beta.26
(GTK4 + WebKitGTK 6.0, que não existe no 22.04). O `Taskfile` já aplica essa
tag automaticamente — `wails3 dev` e `wails3 build` funcionam sem flags
extras. Só é preciso passar `-tags gtk3` manualmente se você rodar `go
build`/`go vet`/`go test` diretamente (sem passar pelo `wails3`/`task`) no
Linux, por exemplo:

```bash
go build -tags gtk3 ./...
go vet -tags gtk3 ./...
```

## Configuração

O arquivo de configuração é criado automaticamente no primeiro uso, em:

| SO | Caminho (`os.UserConfigDir()/prompt-improve/config.yaml`) |
|---|---|
| macOS | `~/Library/Application Support/prompt-improve/config.yaml` |
| Linux | `~/.config/prompt-improve/config.yaml` (ou `$XDG_CONFIG_HOME`) |
| Windows | `%AppData%\prompt-improve\config.yaml` (`C:\Users\<usuário>\AppData\Roaming\prompt-improve\config.yaml`) |

Pela bandeja do sistema é possível abrir ("Editar configuração") e recarregar
("Recarregar configuração") esse arquivo sem reiniciar o app.

### Provider: Ollama local (padrão)

```yaml
provider:
  base_url: "http://localhost:11434/v1"
  api_key: ""
  model: "llama3.2"
  timeout_seconds: 60
```

### Provider: Ollama Cloud

```yaml
provider:
  base_url: "https://ollama.com/v1"
  api_key: "SUA_CHAVE_AQUI"
  model: "llama3.2"
  timeout_seconds: 60
```

### Provider: OpenAI

```yaml
provider:
  base_url: "https://api.openai.com/v1"
  api_key: "SUA_CHAVE_AQUI"
  model: "gpt-4o-mini"
  timeout_seconds: 60
```

### Variável de ambiente `PROMPT_IMPROVE_API_KEY`

Se definida (e não vazia), essa variável de ambiente sobrescreve
`provider.api_key` depois que a configuração é carregada — útil para não
deixar a chave em texto plano no `config.yaml`. Ela nunca é escrita de volta
no arquivo.

```bash
export PROMPT_IMPROVE_API_KEY="sua-chave-aqui"
```

### Adicionando uma ação customizada

Cada ação precisa de um `id` único. Basta adicionar um item em `actions` no
`config.yaml`:

```yaml
actions:
  # ...ações padrão...
  - id: bullet-points
    category: Mensagem
    label: Transformar em tópicos
    instruction: >-
      Reescreva o texto a seguir como uma lista de tópicos curtos e
      objetivos, preservando as informações essenciais. Responda apenas
      com a lista.
```

O app vem com 8 ações padrão (3 na categoria "Prompt", 5 em "Mensagem");
qualquer ação adicionada aparece junto delas no modal.

## Permissões e plataformas

- **macOS**: na primeira execução o app pede a permissão de **Acessibilidade**
  (Ajustes do Sistema › Privacidade e Segurança › Acessibilidade), necessária
  para simular Cmd+C/Cmd+V no app de origem. Sem ela, o modal mostra um aviso
  e só "Copiar" fica disponível.
- **Ubuntu / X11**: a colagem automática depende do `xdotool`
  (`sudo apt install xdotool`). Sem ele, um aviso aparece no modal e só
  "Copiar" funciona.
- **Ubuntu / Wayland**: o protocolo não permite simular teclas globalmente,
  então **só "Copiar" está disponível** — não há colagem automática. Para o
  atalho global, duas opções:
  - usar um portal de atalho global compatível (quando disponível na sua
    distro/compositor); ou
  - configurar um atalho de teclado customizado no GNOME
    (Configurações › Teclado › Atalhos personalizados) apontando para
    `prompt-improve --trigger`, que reabre a instância já em execução e
    dispara a captura.
- **Windows**: nenhuma permissão especial é necessária; `SendInput` funciona
  sem elevação (não alcança janelas elevadas por causa do UIPI, o que
  aparece como erro ao colar nesse caso específico).

## Atalhos no modal

| Atalho | Ação |
|---|---|
| `Enter` | Executa a ação selecionada (ou envia a instrução livre) |
| `⌘/Ctrl+Enter` | **Substituir** — cola o resultado no app de origem |
| `⌘/Ctrl+Shift+C` | **Copiar** — copia o resultado para a área de transferência |
| `Esc` | Fecha o modal (cancela o streaming em andamento, se houver) |

## Limitações conhecidas

- A captura de seleção sobrescreve temporariamente a área de transferência
  com um valor sentinela; se o conteúdo original não for texto (imagem,
  arquivos...), ele **não é restaurado** depois — essa é uma limitação
  conhecida do mecanismo de captura via clipboard. Se nada estiver
  selecionado, o sentinela pode permanecer na área de transferência.
- **macOS**: as teclas simuladas de Copiar/Colar usam os keycodes ANSI do
  teclado (`kVK_ANSI_C`/`kVK_ANSI_V`); em layouts não-ANSI o atalho físico
  correspondente pode não coincidir com Cmd+C/Cmd+V.
- **Wayland** não tem colagem automática — apenas "Copiar" está disponível
  (ver [Permissões e plataformas](#permissões-e-plataformas)).
- A captura espera até 400ms pela mudança na área de transferência; um app
  de origem muito lento para responder ao Copiar simulado (mais que isso)
  pode resultar em "nenhum texto selecionado" mesmo com uma seleção válida.

## Desenvolvimento

```bash
wails3 dev                          # app em modo desenvolvimento (tray + hot reload)
wails3 build                        # build de produção
wails3 generate bindings -ts        # regenera os bindings TS após mudar métodos Go
go test ./...                       # testes do backend
npm --prefix frontend test          # testes do frontend (Vitest)
```

### Mapa de pacotes

| Pacote | Responsabilidade |
|---|---|
| `main.go` | Bootstrap Wails: app, tray, janela, atalho global, single-instance. |
| `internal/config` | Tipos de config, `Load`/`Save`/`Default`, validação, ações padrão. |
| `internal/llm` | Cliente OpenAI-compatível com streaming SSE (`/v1/chat/completions`). |
| `internal/improver` | Monta mensagens (system + user) a partir de ação/instrução e roda o stream. |
| `internal/platform` | Interfaces `Clipboard`/`KeySender`, `Capture`/`Paste`, detecção de sessão e teclas por SO. |
| `internal/app` | `ImproveService` exposto ao frontend (bindings) e adapters do Wails. |
| `frontend/src` | Modal em React: `App.tsx`, `components/*`, `lib/useImprove.ts`. |

Mais detalhes de arquitetura, regras do projeto e skills/MCPs relevantes
estão em [`CLAUDE.md`](./CLAUDE.md); o plano e o spec de design completos
ficam em
[`.superpowers/sdd/2026-09-25-prompt-improve/`](./.superpowers/sdd/2026-09-25-prompt-improve/)
e em [`docs/superpowers/`](./docs/superpowers/).
