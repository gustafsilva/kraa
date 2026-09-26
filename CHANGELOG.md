# Changelog

Todas as mudanças relevantes deste projeto são registradas aqui.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa
[Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Adicionado

- App de bandeja para macOS, Windows e Linux que melhora o texto selecionado via LLM
  compatível com OpenAI (padrão: Ollama local), com resposta em stream, "Substituir" e "Copiar".
- 8 ações padrão e ações customizadas no `config.yaml`.
- Seletor de modelo no topo do modal, que grava `provider.model` no `config.yaml`.
- "Iniciar com o sistema" pela bandeja e pela CLI.
- Pacote npm `prompt-improve` (instalador + CLI com `start`, `stop`, `trigger`, `config`,
  `autostart`, `doctor`, `install`) e scripts `install.sh`/`install.ps1`.
- Workflow de release com binários para macOS (universal), Windows x64 e Linux x64/arm64 e
  `checksums.txt`.
- Site de documentação em `site/` (Astro + MDX + shadcn/ui), publicado no GitHub Pages pelo
  workflow `docs.yml`.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` e templates de issue e de pull request.
- Perfil do usuário (bloco `profile` do `config.yaml`, desativado por padrão), editável em
  "Perfil do usuário…" na bandeja e enviado ao LLM nas ações com `use_profile: true` e na
  instrução livre.
- `provider.temperature` (template: `0.2`), enviada só quando definida.

### Alterado

- System prompt e instruções das ações de Prompt revisados: usam só o que está no texto, na
  instrução e no perfil, com placeholders (`[público-alvo]`) em vez de suposições, e formato
  adaptado à complexidade do pedido.

[Não lançado]: https://github.com/gustafsilva/prompt-improve-beta/commits/main
