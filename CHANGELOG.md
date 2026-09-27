# Changelog

Todas as mudanças relevantes deste projeto são registradas aqui.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa
[Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Alterado

- O pacote npm passa a se chamar `@gustavofsilva/kraa` (o npm recusou o nome `kraa` por ser
  parecido demais com pacotes existentes). O comando continua `kraa`:
  `npm i -g @gustavofsilva/kraa && kraa start`.

### Corrigido

- A bandeja mostra o corvo do Kraa em vez do ícone padrão do Wails, adaptado ao tema claro e
  escuro em macOS, Windows e Linux.
- Ícone do app redesenhado com fundo âmbar para continuar legível em tamanho pequeno (lista de
  Acessibilidade, Finder, Dock); antes o corvo preto sumia no fundo escuro.

## [0.1.0] - 2026-09-26

### Adicionado

- App de bandeja para macOS, Windows e Linux que melhora o texto selecionado via LLM
  compatível com OpenAI (padrão: Ollama local), com resposta em stream, "Substituir" e "Copiar".
- 8 ações padrão e ações customizadas no `config.yaml`.
- Seletor de modelo no topo do modal, que grava `provider.model` no `config.yaml`.
- "Iniciar com o sistema" pela bandeja e pela CLI.
- Pacote npm `kraa` (instalador + CLI com `start`, `stop`, `trigger`, `config`,
  `autostart`, `doctor`, `install`) e scripts `install.sh`/`install.ps1`.
- Workflow de release com binários para macOS (universal), Windows x64 e Linux x64/arm64 e
  `checksums.txt`.
- Site de documentação em `site/` (Astro + MDX + shadcn/ui), publicado no GitHub Pages pelo
  workflow `docs.yml`.
- Identidade visual com o mascote Kraa (corvo): banner no README, ícone do app, logo,
  favicons, imagem de compartilhamento, hero e ilustrações nas páginas do site. Imagens e
  prompts de geração em `docs/brand/`.
- Mascote Kraa no modal (preview vazio, aguardando ação, gerando e erro) e na janela do
  perfil.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` e templates de issue e de pull request.
- Perfil do usuário (bloco `profile` do `config.yaml`, desativado por padrão), editável em
  "Perfil do usuário…" na bandeja e enviado ao LLM nas ações com `use_profile: true` e na
  instrução livre.
- `provider.temperature` (template: `0.2`), enviada só quando definida.
- Template de issue para melhorias na documentação e checklist de uso de IA no template de PR.

### Alterado

- O app passa a se chamar **Kraa** (antes Prompt Improve), mesmo nome do mascote: comando e
  pacote npm `kraa`, variáveis de ambiente `KRAA_*`, pastas de configuração e de dados `kraa`,
  id do app `dev.matrixia.kraa` e repositório `gustafsilva/kraa`.
- System prompt e instruções das ações de Prompt revisados: usam só o que está no texto, na
  instrução e no perfil, com placeholders (`[público-alvo]`) em vez de suposições, e formato
  adaptado à complexidade do pedido.
- Modal em duas colunas (ações à esquerda, resultado à direita) e fluxo só com teclado: ↑/↓ e
  Enter escolhem a ação, ←/→ e Enter escolhem entre Copiar e Substituir, ↑ volta às ações.
- A instrução livre agora é digitada na própria busca de ações (o campo separado saiu).
- README reescrito com foco em instalar e começar a usar (GIF de demonstração, instalação em
  três passos e tabela de atalhos) e guia de contribuição voltado à primeira contribuição
  (como pegar uma issue, passo a passo, política de uso de IA e prazo de resposta).
- Release mais seguro: actions fixadas por SHA (atualizadas pelo Dependabot), sem cache nos
  builds de release, release criado como rascunho (compatível com releases imutáveis) e
  publicação no npm por trusted publishing (OIDC, sem token) em modo staging, que só vai ao ar
  com a aprovação do mantenedor com 2FA.

[Não lançado]: https://github.com/gustafsilva/kraa/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/gustafsilva/kraa/releases/tag/v0.1.0
