# Issues iniciais (rascunho)

Rascunho para revisão do mantenedor. Depois de aprovado, cada bloco `##` vira uma issue
(`gh issue create`, Task 6 do plano `docs/superpowers/plans/2026-09-26-readme-contribuicao.md`).

## Validar e documentar o provider Gemini (Google AI)

Labels: area: providers, documentation, good first issue, help wanted

### Contexto
O Kraa conversa com qualquer serviço compatível com a API **Chat Completions** da OpenAI
(`internal/llm/client.go`, `POST {base_url}/chat/completions` em streaming SSE). O Google expõe
uma camada de compatibilidade com essa API para o Gemini na base
`https://generativelanguage.googleapis.com/v1beta/openai/`, mas ninguém ainda testou esse
caminho no Kraa nem documentou a receita em `providers.mdx`. Sem isso, quem quiser usar Gemini
fica sem instruções. É preciso gerar uma chave de API do Google AI Studio (o provider tem
camada gratuita).

### O que fazer
- Gerar uma API key no Google AI Studio.
- Configurar o bloco `provider` do `config.yaml` local com `base_url:
  "https://generativelanguage.googleapis.com/v1beta/openai/"`, o `model` de um Gemini disponível
  e a `api_key` (ou a env `KRAA_API_KEY`).
- Rodar `wails3 dev`, abrir o modal (atalho padrão `CmdOrCtrl+Shift+Y`), escolher uma ação e
  confirmar que o resultado chega em stream.
- Conferir se o seletor de modelo no topo do modal lista os modelos do Gemini (usa
  `internal/llm/models.go`, `ListModels`, que consulta `GET {base_url}/models`).
- Testar `provider.temperature` no `config.yaml` e confirmar se o Gemini aceita o campo do jeito
  que `internal/llm/client.go` envia (`chatRequest.Temperature`).
- Escrever uma seção "Gemini" em `providers.mdx`, no mesmo formato das seções "Ollama Cloud" e
  "OpenAI" (bloco `yaml` com `base_url`, `api_key`, `model`, `timeout_seconds`).
- Se algo quebrar (streaming, listagem de modelos ou `temperature` rejeitada), abrir uma issue
  separada descrevendo o problema, ou corrigir no mesmo PR se for simples.

### Arquivos envolvidos
- `site/src/content/docs/configuracao/providers.mdx`: adicionar a seção "Gemini".
- `internal/llm/client.go`: nenhuma mudança de código esperada; é onde o streaming e o envio de
  `temperature` acontecem, então é o ponto a conferir se o Gemini se comportar diferente do
  esperado.
- `internal/llm/models.go`: função `ListModels`, usada pelo seletor de modelo; confira o formato
  da resposta de `GET /models` do Gemini.

### Critério de pronto
- [ ] Seção "Gemini" documentada em `providers.mdx`, no formato das seções existentes.
- [ ] Print ou relato (no PR ou na issue) do stream funcionando com o Gemini.
- [ ] `npm --prefix site run build` passa sem erros.

### Como testar
```bash
npm --prefix site run build
```
Manualmente: configurar o provider no `config.yaml`, rodar `wails3 dev`, abrir o modal e
escolher uma ação para conferir o stream.

Primeira vez por aqui? Veja o [guia de contribuição](https://github.com/gustafsilva/kraa/blob/main/CONTRIBUTING.md#como-pegar-uma-issue) e comente pedindo para ser atribuído.

## Validar e documentar o provider Anthropic (Claude)

Labels: area: providers, documentation, help wanted

### Contexto
A Anthropic expõe uma camada de compatibilidade com a API Chat Completions da OpenAI na base
`https://api.anthropic.com/v1/`, mas ninguém ainda validou esse caminho no Kraa
(`internal/llm/client.go`) nem documentou a receita em `providers.mdx`. Sem isso, quem quiser
usar modelos Claude fica sem instruções. É preciso uma chave de API com créditos pagos da
Anthropic (não há camada gratuita).

### O que fazer
- Gerar uma API key no console da Anthropic.
- Configurar o bloco `provider` do `config.yaml` local com `base_url:
  "https://api.anthropic.com/v1/"`, o `model` de um Claude disponível na camada de compatibilidade
  OpenAI e a `api_key` (ou a env `KRAA_API_KEY`).
- Rodar `wails3 dev`, abrir o modal (atalho padrão `CmdOrCtrl+Shift+Y`), escolher uma ação e
  confirmar que o resultado chega em stream.
- Conferir se o seletor de modelo no topo do modal lista os modelos (usa
  `internal/llm/models.go`, `ListModels`, que consulta `GET {base_url}/models`).
- Testar `provider.temperature` no `config.yaml` e confirmar se essa camada aceita o campo do
  jeito que `internal/llm/client.go` envia (`chatRequest.Temperature`).
- Escrever uma seção "Anthropic (Claude)" em `providers.mdx`, no mesmo formato das seções "Ollama
  Cloud" e "OpenAI".
- Se algo quebrar, abrir uma issue separada descrevendo o problema, ou corrigir no mesmo PR se
  for simples.

### Arquivos envolvidos
- `site/src/content/docs/configuracao/providers.mdx`: adicionar a seção "Anthropic (Claude)".
- `internal/llm/client.go`: nenhuma mudança de código esperada; conferir o comportamento do
  streaming e do envio de `temperature`.
- `internal/llm/models.go`: função `ListModels`, usada pelo seletor de modelo; confira o formato
  da resposta de `GET /models` dessa camada de compatibilidade.

### Critério de pronto
- [ ] Seção "Anthropic (Claude)" documentada em `providers.mdx`, no formato das seções
      existentes.
- [ ] Print ou relato (no PR ou na issue) do stream funcionando.
- [ ] `npm --prefix site run build` passa sem erros.

### Como testar
```bash
npm --prefix site run build
```
Manualmente: configurar o provider no `config.yaml`, rodar `wails3 dev`, abrir o modal e
escolher uma ação para conferir o stream.

Primeira vez por aqui? Veja o [guia de contribuição](https://github.com/gustafsilva/kraa/blob/main/CONTRIBUTING.md#como-pegar-uma-issue) e comente pedindo para ser atribuído.

## Validar e documentar o provider Grok (xAI)

Labels: area: providers, documentation, help wanted

### Contexto
A xAI expõe a API do Grok compatível com o formato Chat Completions da OpenAI na base
`https://api.x.ai/v1`, mas ninguém ainda validou esse caminho no Kraa (`internal/llm/client.go`)
nem documentou a receita em `providers.mdx`. Sem isso, quem quiser usar Grok fica sem
instruções. É preciso uma chave de API com créditos pagos da xAI (não há camada gratuita).

### O que fazer
- Gerar uma API key no console da xAI.
- Configurar o bloco `provider` do `config.yaml` local com `base_url: "https://api.x.ai/v1"`, o
  `model` de um Grok disponível e a `api_key` (ou a env `KRAA_API_KEY`).
- Rodar `wails3 dev`, abrir o modal (atalho padrão `CmdOrCtrl+Shift+Y`), escolher uma ação e
  confirmar que o resultado chega em stream.
- Conferir se o seletor de modelo no topo do modal lista os modelos do Grok (usa
  `internal/llm/models.go`, `ListModels`, que consulta `GET {base_url}/models`).
- Testar `provider.temperature` no `config.yaml` e confirmar se a xAI aceita o campo do jeito
  que `internal/llm/client.go` envia (`chatRequest.Temperature`).
- Escrever uma seção "Grok (xAI)" em `providers.mdx`, no mesmo formato das seções "Ollama Cloud"
  e "OpenAI".
- Se algo quebrar, abrir uma issue separada descrevendo o problema, ou corrigir no mesmo PR se
  for simples.

### Arquivos envolvidos
- `site/src/content/docs/configuracao/providers.mdx`: adicionar a seção "Grok (xAI)".
- `internal/llm/client.go`: nenhuma mudança de código esperada; conferir o comportamento do
  streaming e do envio de `temperature`.
- `internal/llm/models.go`: função `ListModels`, usada pelo seletor de modelo; confira o formato
  da resposta de `GET /models` da xAI.

### Critério de pronto
- [ ] Seção "Grok (xAI)" documentada em `providers.mdx`, no formato das seções existentes.
- [ ] Print ou relato (no PR ou na issue) do stream funcionando com o Grok.
- [ ] `npm --prefix site run build` passa sem erros.

### Como testar
```bash
npm --prefix site run build
```
Manualmente: configurar o provider no `config.yaml`, rodar `wails3 dev`, abrir o modal e
escolher uma ação para conferir o stream.

Primeira vez por aqui? Veja o [guia de contribuição](https://github.com/gustafsilva/kraa/blob/main/CONTRIBUTING.md#como-pegar-uma-issue) e comente pedindo para ser atribuído.

## Documentar uma seção própria para o OpenRouter

Labels: area: providers, documentation, good first issue, help wanted

### Contexto
O OpenRouter (`https://openrouter.ai/api/v1`) hoje só é citado de passagem em `providers.mdx`,
dentro da seção genérica "Outros endpoints compatíveis" ("LM Studio, vLLM, llama.cpp server,
OpenRouter e similares..."). Ele dá acesso a dezenas de modelos com uma única chave, o que faz
diferença para quem está começando, mas não tem uma receita própria como "Ollama Cloud" ou
"OpenAI" têm. É preciso gerar uma chave de API do OpenRouter (o provider tem camada gratuita).

### O que fazer
- Gerar uma API key no OpenRouter.
- Configurar o bloco `provider` do `config.yaml` local com `base_url:
  "https://openrouter.ai/api/v1"`, o `model` de um modelo disponível no OpenRouter (formato
  `fornecedor/modelo`) e a `api_key` (ou a env `KRAA_API_KEY`).
- Rodar `wails3 dev`, abrir o modal (atalho padrão `CmdOrCtrl+Shift+Y`), escolher uma ação e
  confirmar que o resultado chega em stream.
- Conferir se o seletor de modelo no topo do modal lista os modelos do OpenRouter (usa
  `internal/llm/models.go`, `ListModels`, que consulta `GET {base_url}/models`).
- Testar `provider.temperature` no `config.yaml`.
- Escrever uma seção própria "OpenRouter" em `providers.mdx`, no mesmo formato das seções
  "Ollama Cloud" e "OpenAI", e remover a menção solta ao OpenRouter dentro de "Outros endpoints
  compatíveis" (deixando ali só LM Studio, vLLM, llama.cpp server e similares).
- Se algo quebrar, abrir uma issue separada descrevendo o problema, ou corrigir no mesmo PR se
  for simples.

### Arquivos envolvidos
- `site/src/content/docs/configuracao/providers.mdx`: adicionar a seção própria "OpenRouter" e
  ajustar a lista em "Outros endpoints compatíveis".
- `internal/llm/client.go`: nenhuma mudança de código esperada; conferir o comportamento do
  streaming e do envio de `temperature`.
- `internal/llm/models.go`: função `ListModels`, usada pelo seletor de modelo; confira o formato
  da resposta de `GET /models` do OpenRouter.

### Critério de pronto
- [ ] Seção "OpenRouter" documentada em `providers.mdx`, no formato das seções existentes, e
      removida da lista genérica.
- [ ] Print ou relato (no PR ou na issue) do stream funcionando com o OpenRouter.
- [ ] `npm --prefix site run build` passa sem erros.

### Como testar
```bash
npm --prefix site run build
```
Manualmente: configurar o provider no `config.yaml`, rodar `wails3 dev`, abrir o modal e
escolher uma ação para conferir o stream.

Primeira vez por aqui? Veja o [guia de contribuição](https://github.com/gustafsilva/kraa/blob/main/CONTRIBUTING.md#como-pegar-uma-issue) e comente pedindo para ser atribuído.

## Adicionar a ação padrão "Resumir em tópicos"

Labels: area: backend, good first issue

### Contexto
As ações pré-configuradas do modal ficam no template `defaultConfigYAML`
(`internal/config/defaults.go`) e são hoje só estas oito: Melhorar prompt, Adicionar contexto,
Mais específico (categoria Prompt), Mais formal, Mais casual, Mais curto, Corrigir gramática e
Traduzir para inglês (categoria Mensagem). Não existe uma ação para resumir um texto em tópicos,
um pedido comum em textos longos colados no modal.

### O que fazer
- Adicionar uma nova ação `id: summarize-bullets`, categoria `Mensagem`, rótulo "Resumir em
  tópicos", com uma instrução que peça para reescrever o texto como uma lista de tópicos curtos
  e objetivos, preservando as informações essenciais, terminando com "Responda apenas com a
  lista." (mesmo estilo das instruções vizinhas).
- Adicionar essa ação ao final da lista `actions` dentro de `defaultConfigYAML`, em
  `internal/config/defaults.go`.
- Atualizar `TestDefault_HasEightValidActions`, em `internal/config/config_test.go`: o total de
  ações passa de 8 para 9, e a contagem de ações da categoria `Mensagem` passa de 5 para 6 (o
  nome da função pode ser atualizado também, já que deixa de ser "oito").
- Atualizar a tabela "Ações padrão" em `acoes-customizadas.mdx`, acrescentando a linha da nova
  ação, e o texto que hoje diz "Para manter as 8 originais" (ele precisa refletir 9).

### Arquivos envolvidos
- `internal/config/defaults.go`: acrescentar a ação `summarize-bullets` ao template
  `defaultConfigYAML`.
- `internal/config/config_test.go`: função `TestDefault_HasEightValidActions` (linha 43),
  atualizar as asserções de contagem.
- `site/src/content/docs/configuracao/acoes-customizadas.mdx`: atualizar a tabela "Ações
  padrão" e o texto sobre "as 8 originais".

### Critério de pronto
- [ ] `internal/config/defaults.go` inclui a ação `summarize-bullets` com rótulo "Resumir em
      tópicos".
- [ ] `go test ./internal/config/...` passa com as novas contagens (9 ações, 6 da categoria
      Mensagem).
- [ ] `acoes-customizadas.mdx` lista a nova ação na tabela e não fala mais em "8 originais".

### Como testar
```bash
go test ./internal/config/...
npm --prefix site run build
```

Primeira vez por aqui? Veja o [guia de contribuição](https://github.com/gustafsilva/kraa/blob/main/CONTRIBUTING.md#como-pegar-uma-issue) e comente pedindo para ser atribuído.

## Revisar "Primeiros passos" com olhar de quem chega agora

Labels: documentation, area: site, good first issue

### Contexto
A página `primeiros-passos.mdx` é o primeiro contato de quem acabou de instalar o Kraa. Ela só
foi revisada por quem já conhece o projeto, então passos óbvios para o time podem estar confusos
ou faltando para alguém numa máquina limpa.

### O que fazer
- Numa máquina limpa (ou uma conta/usuário novo), seguir `site/src/content/docs/uso/primeiros-passos.mdx` do zero, sem pular passos nem usar conhecimento prévio do projeto.
- Anotar qualquer trecho confuso, comando que falhou, pré-requisito que faltou (por exemplo,
  algo já assumido de `instalacao/npm.mdx` ou `instalacao/ollama.mdx`) ou passo fora de ordem.
- Abrir um PR corrigindo a redação, a ordem dos passos ou os comandos, nos arquivos afetados.

### Arquivos envolvidos
- `site/src/content/docs/uso/primeiros-passos.mdx`: corrigir o que estiver confuso ou
  desatualizado.
- `site/src/content/docs/instalacao/npm.mdx`: ajustar caso o problema esteja na instalação via
  npm.
- `site/src/content/docs/instalacao/ollama.mdx`: ajustar caso o problema esteja na instalação
  do Ollama.

### Critério de pronto
- [ ] PR com a correção específica encontrada (redação, ordem ou comando), não uma reescrita
      geral da página.
- [ ] `npm --prefix site run build` passa sem erros.

### Como testar
```bash
npm --prefix site run build
```

Primeira vez por aqui? Veja o [guia de contribuição](https://github.com/gustafsilva/kraa/blob/main/CONTRIBUTING.md#como-pegar-uma-issue) e comente pedindo para ser atribuído.

## Rodar o checklist manual do Windows e relatar o resultado

Labels: SO: windows, help wanted

### Contexto
O `CLAUDE.md` tem uma seção "Checklist de verificação manual por SO" com um roteiro específico
para Windows (atalho, stream, `Ctrl+Enter` para substituir, clipboard restaurado, `Esc` cancela
sem erro, janela oculta da barra de tarefas). Ninguém do time confirmou recentemente que esse
roteiro passa numa máquina Windows real; essa issue não pede código, só o relato dos resultados.

### O que fazer
- Instalar o Kraa no Windows (build local com `wails3 build` ou o pacote npm, depois do
  primeiro release).
- Seguir, item a item, a seção **Windows** do checklist em `CLAUDE.md` (em "Checklist de
  verificação manual por SO").
- Comentar na issue quais itens passaram, quais falharam (com print ou descrição do
  comportamento) e a versão do Windows usada.

### Arquivos envolvidos
- `CLAUDE.md`: seção "Checklist de verificação manual por SO" → "Windows"; nenhuma mudança de
  código é esperada, o arquivo só serve de roteiro para o teste manual.

### Critério de pronto
- [ ] Comentário na issue cobrindo cada item da seção Windows do checklist, com o resultado
      (passou/falhou) e a versão do Windows testada.
- [ ] Qualquer falha encontrada vira uma issue nova, linkada a partir desta.

### Como testar
Não há comando automatizado: seguir manualmente o roteiro da seção "Windows" em `CLAUDE.md`.

Primeira vez por aqui? Veja o [guia de contribuição](https://github.com/gustafsilva/kraa/blob/main/CONTRIBUTING.md#como-pegar-uma-issue) e comente pedindo para ser atribuído.

## Rodar o checklist manual do Ubuntu (X11 e Wayland) e relatar o resultado

Labels: SO: linux, help wanted

### Contexto
O `CLAUDE.md` tem uma seção "Checklist de verificação manual por SO" com um roteiro específico
para Ubuntu, cobrindo tanto X11 (com `xdotool`, e o aviso quando ele falta) quanto Wayland (só
"Copiar" disponível, atalho via `kraa --trigger`). Ninguém do time confirmou recentemente que
esse roteiro passa numa máquina Ubuntu real, nas duas sessões; essa issue não pede código, só o
relato dos resultados.

### O que fazer
- Instalar o Kraa num Ubuntu (build local com `wails3 build` ou o pacote npm, depois do
  primeiro release).
- Seguir, item a item, a seção **Ubuntu** do checklist em `CLAUDE.md` (em "Checklist de
  verificação manual por SO"), tanto em uma sessão X11 quanto em uma sessão Wayland.
- Comentar na issue quais itens passaram, quais falharam (com print ou descrição do
  comportamento), a versão do Ubuntu e o tipo de sessão (X11/Wayland) usada em cada teste.

### Arquivos envolvidos
- `CLAUDE.md`: seção "Checklist de verificação manual por SO" → "Ubuntu"; nenhuma mudança de
  código é esperada, o arquivo só serve de roteiro para o teste manual.

### Critério de pronto
- [ ] Comentário na issue cobrindo cada item da seção Ubuntu do checklist, com o resultado
      (passou/falhou), separando X11 de Wayland.
- [ ] Qualquer falha encontrada vira uma issue nova, linkada a partir desta.

### Como testar
Não há comando automatizado: seguir manualmente o roteiro da seção "Ubuntu" em `CLAUDE.md`, uma
vez em X11 e uma vez em Wayland.

Primeira vez por aqui? Veja o [guia de contribuição](https://github.com/gustafsilva/kraa/blob/main/CONTRIBUTING.md#como-pegar-uma-issue) e comente pedindo para ser atribuído.

## Testar o chunk SSE com JSON inválido em `readSSEStream`

Labels: area: backend, good first issue

### Contexto
Em `internal/llm/client.go`, a função `readSSEStream` (a partir da linha 155) lê cada linha
`data: ...` do stream SSE e faz `json.Unmarshal` no conteúdo (linha 180). Se o `Unmarshal`
falhar, o código só ignora a linha com `continue` (linha 181) em vez de encerrar o stream com
erro — mas não existe nenhum teste em `internal/llm/client_test.go` que comprove esse
comportamento nem que o stream continua normalmente para os chunks seguintes.

### O que fazer
- Escrever um teste que suba um `httptest.Server` retornando, em sequência, uma linha `data:`
  com um JSON inválido (por exemplo `data: {não é json}`) seguida de uma linha `data:` válida
  com conteúdo (por exemplo `data: {"choices":[{"delta":{"content":"ok"}}]}`) e `data: [DONE]`.
- Confirmar que `Stream` retorna `nil` (sem erro) e que o conteúdo acumulado é só `"ok"` — ou
  seja, a linha inválida foi ignorada, não travou o stream nem virou erro.

### Arquivos envolvidos
- `internal/llm/client.go`: função `readSSEStream` (linha 155), especificamente o `continue` da
  linha 181; nenhuma mudança de comportamento é esperada, só o teste que falta.
- `internal/llm/client_test.go`: acrescentar o novo caso de teste, no mesmo estilo dos
  `TestStream_*` já existentes (por exemplo, perto de `TestStream_IgnoresKeepAliveAndEmptyLines`).

### Critério de pronto
- [ ] Novo teste em `internal/llm/client_test.go` cobrindo uma linha `data:` com JSON inválido.
- [ ] `go test ./internal/llm/...` passa, incluindo o teste novo.

### Como testar
```bash
go test ./internal/llm/...
```
(ou `-run` com o nome do seu teste)

Primeira vez por aqui? Veja o [guia de contribuição](https://github.com/gustafsilva/kraa/blob/main/CONTRIBUTING.md#como-pegar-uma-issue) e comente pedindo para ser atribuído.

## Testar o chunk SSE sem `choices` em `readSSEStream`

Labels: area: backend, good first issue

### Contexto
Em `internal/llm/client.go`, `readSSEStream` também ignora, com `continue` (linha 187), qualquer
chunk cujo campo `choices` venha vazio ou ausente (linha 186, `len(chunk.Choices) == 0`). Isso é
comum na prática: alguns provedores compatíveis com a API da OpenAI mandam um último evento SSE
só com um objeto `usage`, sem `choices`, antes do `[DONE]`. Não há nenhum teste em
`internal/llm/client_test.go` cobrindo esse formato de chunk.

### O que fazer
- Escrever um teste que suba um `httptest.Server` retornando, em sequência, um chunk com
  conteúdo (`data: {"choices":[{"delta":{"content":"parcial"}}]}`), um chunk final sem
  `choices` (por exemplo `data: {"usage":{"total_tokens":42}}`) e `data: [DONE]`.
- Confirmar que `Stream` retorna `nil` (sem erro) e que o conteúdo acumulado é só `"parcial"` —
  ou seja, o chunk sem `choices` foi ignorado sem quebrar o stream.

### Arquivos envolvidos
- `internal/llm/client.go`: função `readSSEStream` (linha 155), especificamente o `continue` da
  linha 187; nenhuma mudança de comportamento é esperada, só o teste que falta.
- `internal/llm/client_test.go`: acrescentar o novo caso de teste, no mesmo estilo dos
  `TestStream_*` já existentes.

### Critério de pronto
- [ ] Novo teste em `internal/llm/client_test.go` cobrindo um chunk final sem `choices` (por
      exemplo, um chunk só de `usage`).
- [ ] `go test ./internal/llm/...` passa, incluindo o teste novo.

### Como testar
```bash
go test ./internal/llm/...
```
(ou `-run` com o nome do seu teste)

Primeira vez por aqui? Veja o [guia de contribuição](https://github.com/gustafsilva/kraa/blob/main/CONTRIBUTING.md#como-pegar-uma-issue) e comente pedindo para ser atribuído.
