# README e contribuição — design

Data: 2026-09-26. Item do BACKLOG: "Ajustar documentação focada em contribuição".

## Objetivo

Deixar o projeto pronto para receber usuários e contribuidores novos da comunidade
brasileira: um README que leve do "o que é isso?" à primeira melhoria de texto em poucos
minutos, e um caminho claro para a primeira contribuição.

Sucesso = uma pessoa que nunca viu o Kraa consegue (a) instalar e usar só pelo README e
(b) escolher uma issue, preparar o ambiente e abrir um PR só pelo CONTRIBUTING e pelas
issues abertas.

## Decisões

- **Idioma:** tudo em PT-BR (README, CONTRIBUTING, templates, labels, issues). Sem versão em
  inglês.
- **Hacktoberfest:** fora do escopo por ora. A edição de 2026 deixou de contar PRs e passou a
  focar em eventos ("Fests") sobre IA open source e modelos open-weight
  (<https://hacktoberfest.com/questions/>); o mantenedor decide depois como participar.
- **Instalação:** o README descreve o estado final (npm e scripts). Hoje não há release no
  GitHub nem pacote `kraa` no npm, então **a divulgação depende do primeiro release**, que é
  um sub-projeto separado ("Terminar configuração para instalação e distribuição").
- **Divisão por papel (abordagem A):**
  - README = vitrine e uso;
  - `CONTRIBUTING.md` = processo de contribuição;
  - site (`site/src/content/docs/contribuir/`) = parte técnica (ambiente, arquitetura, testes,
    release). O CONTRIBUTING aponta para o site em vez de copiar.
- **Prazo de resposta a issues/PRs:** até 7 dias.
- **Política de IA:** permitido, com responsabilidade de quem envia (ver seção 2).

## 1. README

Ordem das seções:

1. Banner do mascote (`docs/brand/kraa-banner.png`) e badges: CI, Docs, npm, licença MIT,
   "PRs bem-vindos".
2. Frase de valor, antes de qualquer detalhe técnico, destacando: qualquer app, um atalho,
   IA local e gratuita com Ollama (o texto não sai da máquina por padrão).
3. Demo: `docs/brand/demo.gif` (ou `demo.png`, ver seção 4).
4. "Por que usar", com 3 a 4 tópicos: funciona em qualquer app; 100% local por padrão; qualquer
   API compatível com OpenAI; macOS, Windows e Linux.
5. Instalação em 3 passos numerados, um comando por passo:
   1. Ollama + `ollama pull llama3.2`;
   2. `npm i -g kraa && kraa start` (Node 18+);
   3. `kraa doctor`.

   Os scripts sem Node (`install.sh`/`install.ps1`) e as notas por SO (Acessibilidade no
   macOS, pacotes apt e limitação do Wayland no Linux) ficam num `<details>` recolhido.
6. Primeiro uso: o diagrama ASCII atual e uma tabela de atalhos (abrir `⌘/Ctrl+Shift+Y`,
   Substituir `⌘/Ctrl+Enter`, Copiar `⌘/Ctrl+Shift+C`, `Esc` fecha).
7. Documentação: a tabela de links atual.
8. Contribua: 2 a 3 linhas com links para issues `good first issue`, `CONTRIBUTING.md` e
   Discussions.
9. Licença.

Sai do README: o bloco "Desenvolvimento" com os comandos (vai para CONTRIBUTING e site).

Toda afirmação (atalhos, comandos, requisitos) deve ser conferida no código antes de ser
escrita. Conferido no design: atalho padrão `CmdOrCtrl+Shift+Y` (`internal/config/config.go`),
`engines.node >=18` (`npm/package.json`), subcomandos `start`, `stop`, `trigger`, `config`,
`autostart`, `doctor`, `install`, `--version` (`npm/src/cli.ts`).

## 2. CONTRIBUTING.md

Seções, na ordem:

1. **Boas-vindas + primeira vez em open source:** links para o Open Source Guides em PT-BR
   (<https://opensource.guide/pt/how-to-contribute/>) e para o fluxo de fork/PR do GitHub.
2. **Formas de contribuir** (tabela com "o que precisa saber"):
   - reportar bug ou testar em um SO (nenhum código);
   - documentação (Markdown/MDX);
   - ações padrão (YAML/Go leve);
   - frontend (React/TS);
   - backend, providers e plataforma (Go).
3. **Como pegar uma issue:**
   - filtrar por `good first issue` / `help wanted`;
   - comentar pedindo para ser atribuído e esperar a atribuição antes de abrir o PR;
   - sem atividade em 14 dias, a issue volta a ficar livre;
   - ideias novas: abrir uma issue ou discussão antes de codar.
4. **Primeira contribuição, passo a passo:**
   1. fork, clone e branch;
   2. preparar o ambiente (resumo mínimo dos comandos + link para `contribuir/ambiente`);
   3. teste primeiro (TDD);
   4. rodar a verificação;
   5. commit em Conventional Commits;
   6. abrir o PR.
5. **Checklist antes do PR:** comandos de teste atuais (`go test ./...` com `-tags gtk3` no
   Linux, `npm --prefix frontend test`, `npm --prefix npm test`, `npm --prefix site run build`
   quando mexer na doc), `CHANGELOG.md` (seção "Não lançado") e docs.
6. **Regras do projeto:**
   - fronteira do Wails (só `main.go` e `internal/app` importam o Wails);
   - build tags por SO, nunca `if runtime.GOOS` espalhado;
   - UI em PT-BR, código em inglês.
7. **Uso de IA:**
   - pode usar, mas quem envia é responsável pelo que envia;
   - é preciso entender e conseguir explicar cada linha e rodar os testes localmente;
   - uso relevante de IA deve ser marcado no PR;
   - PRs claramente gerados sem revisão são fechados;
   - o `CLAUDE.md` pode ser usado como contexto para agentes.
8. **Revisão:** resposta em até 7 dias; como pedir revisão de novo.
9. **Código de conduta e dúvidas:** link para o `CODE_OF_CONDUCT.md` e para Discussions.

Ajustes relacionados:

- `site/src/content/docs/contribuir/ambiente.mdx`: a seção "Fluxo de contribuição" vira um
  parágrafo com link para o CONTRIBUTING.
- `CLAUDE.md`: remover as referências a "Tasks 5/6/7" (de um plano antigo). As ferramentas
  continuam listadas, sem o número da task.

## 3. GitHub: templates, labels, repositório e issues

### Templates

- `bug_report.yml`: labels `[bug, "status: triagem"]`.
- `feature_request.yml`: labels `[enhancement, "status: triagem"]`; novo campo dropdown "Você
  gostaria de implementar?" (Sim / Talvez, com ajuda / Não).
- Novo `docs.yml` ("Melhorar a documentação"): página afetada (URL ou caminho), o que está
  confuso ou faltando e uma sugestão. Labels `[documentation, "status: triagem"]`.
- `config.yml`: novo link "Dúvidas e ideias" para Discussions.
- `pull_request_template.md`: campo `Fecha #`, checkbox "Li o CONTRIBUTING" e checkbox "Usei
  IA e revisei/entendo todo o código (ou não usei)".

### Labels (via `gh label create/edit`, descrições em PT-BR)

- **Tipo:** `bug`, `enhancement`, `documentation`, `question` (traduzir descrições).
- **Área:** `area: frontend`, `area: backend`, `area: platform`, `area: providers`,
  `area: npm/cli`, `area: site`.
- **SO:** `SO: macOS`, `SO: windows`, `SO: linux`.
- **Entrada:** `good first issue`, `help wanted` (já existem; traduzir descrições).
- **Status:** `status: triagem`, `status: atribuída`.
- As demais labels padrão (`duplicate`, `invalid`, `wontfix`, `accessibility`) ficam como
  estão, com descrições traduzidas.

### Repositório (via `gh repo edit`)

- Descrição em PT-BR e homepage `https://gustafsilva.github.io/kraa/`.
- Topics: `ollama`, `llm`, `writing-assistant`, `wails`, `go`, `react`, `tray-app`,
  `productivity`, `open-source-ai`.
- Discussions ativado, com categorias "Dúvidas", "Ideias" e "Mostre seu uso" (criar ou renomear
  pela interface do GitHub se a API não permitir; neste caso, passo manual documentado no
  plano).

### Issues iniciais

8 a 10 issues, escritas primeiro em `docs/issues-iniciais.md` para revisão do mantenedor e
publicadas via `gh issue create` só depois da aprovação. Formato de cada uma:

- contexto;
- o que fazer;
- arquivos envolvidos;
- critério de pronto;
- como testar;
- labels.

Candidatas (confirmar no código ao escrever):

- **Providers (4):** Gemini, Anthropic, Grok (xAI) e OpenRouter, via endpoints compatíveis com
  OpenAI. Cada issue valida o provider de verdade (streaming, `temperature`, listagem de
  modelos no seletor), documenta a receita em `site/src/content/docs/configuracao/providers.mdx`
  e corrige o que quebrar.
- **Ação padrão nova:** uma que ainda não exista (as atuais incluem Melhorar prompt, Adicionar
  contexto, Mais específico, Mais formal, Mais casual, Mais curto, Corrigir gramática e
  Traduzir para inglês).
- **Docs:** revisar uma página do site do ponto de vista de quem está chegando.
- **Teste em SO:** rodar o checklist manual no Windows e no Linux (X11/Wayland) e relatar o
  resultado, sem código (`SO: *`).
- **Testes/qualidade:** 1 ou 2 pontos sem cobertura identificados no código.

## 4. Demo visual

Fonte: `~/Downloads/Gravação de Tela 2026-09-26 às 22.31.29.mov` (25s, 2704×1520, 120 fps).
Fluxo gravado:

1. digitar um prompt no Gemini;
2. selecionar e apertar o atalho;
3. o modal do Kraa abre;
4. "Melhorar prompt" → "Escrevendo…" → resultado;
5. Substituir → o texto melhorado aparece no Gemini.

Edição com ffmpeg:

- acelerar a digitação (~3x); modal e stream em velocidade normal;
- cortar logo depois da substituição;
- recortar a área central (campo de entrada + modal);
- **borrar a saudação "Vamos lá, Gustavo" e a foto de perfil** em todos os quadros que
  aparecerem no recorte;
- duração alvo de ~10–12s.

Saídas:

- `docs/brand/demo.gif`: ~800px de largura, paleta gerada com `palettegen`/`paletteuse`,
  meta < 5 MB;
- `docs/brand/demo.png`: quadro com o resultado pronto (plano B e uso no site);
- `site/public/demo.mp4` (opcional): para a página inicial do site.

O mantenedor aprova o GIF antes de ele entrar no README. Se o GIF passar de 5 MB depois de
reduzir fps/largura, o README usa o PNG.

## Fora do escopo

- Primeiro release e publicação no npm (sub-projeto próprio; pré-requisito da divulgação).
- Participação no Hacktoberfest 2026 (topic, label `hacktoberfest-accepted`, Fests).
- Revisão completa do site ("Revisar todas as documentações", no BACKLOG).
- Versão em inglês.

## Verificação

- `npm --prefix site run build` e `npm --prefix site run check` passam depois das mudanças no
  site.
- Todos os links relativos do README e do CONTRIBUTING apontam para arquivos existentes.
- Os comandos do README e do CONTRIBUTING conferem com `npm/src/cli.ts`, `go.mod` e
  `package.json`.
- Os templates de issue são YAML válido (o GitHub renderiza o formulário; conferir na aba
  "New issue" depois do push).
- `CHANGELOG.md` recebe um item em "Não lançado" (docs de contribuição).
