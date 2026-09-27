# Kraa

Selecione um texto em qualquer app, aperte um atalho e melhore com IA, rodando local e de graça
com o [Ollama](https://ollama.com). App de bandeja para macOS, Windows e Linux.

Este pacote instala o app e a CLI `kraa`.

## Instalação

```bash
npm i -g @gustavofsilva/kraa && kraa start
```

Requer Node.js 18+. O binário do app é baixado do
[GitHub Release](https://github.com/gustafsilva/kraa/releases) da mesma versão, com verificação
SHA-256. Se o seu npm não rodar scripts de instalação, o `kraa start` baixa o binário na primeira
execução.

## Comandos

| Comando | O que faz |
|---|---|
| `kraa start` / `kraa stop` | Inicia ou encerra o app |
| `kraa trigger` | Dispara a captura no app em execução (útil como atalho do sistema no Wayland) |
| `kraa config` | Abre o `config.yaml` |
| `kraa doctor` | Diagnostica binário, configuração, conexão com o LLM e sessão |
| `kraa autostart on\|off` | Liga ou desliga o início automático |
| `kraa install` | Baixa de novo o binário desta versão |

## Documentação

<https://gustafsilva.github.io/kraa/> · código e issues em
<https://github.com/gustafsilva/kraa>.

## Licença

MIT
