# Política de segurança

## Versões suportadas

Só a versão mais recente publicada nos [releases](https://github.com/gustafsilva/prompt-improve-beta/releases)
recebe correções de segurança.

## Como reportar uma vulnerabilidade

**Não abra uma issue pública.** Use o
[reporte privado de vulnerabilidades](https://github.com/gustafsilva/prompt-improve-beta/security/advisories/new)
do GitHub, com:

- descrição do problema e do impacto;
- passos para reproduzir;
- versão, sistema operacional e provider usados.

Você deve receber uma resposta em até 7 dias. Depois da correção, a vulnerabilidade é divulgada
no advisory e no `CHANGELOG.md`, com crédito a quem reportou (se desejar).

## Escopo

Interessam especialmente: vazamento do texto capturado ou da `api_key`, execução de código via
`config.yaml` ou respostas do provider, e falhas na verificação do SHA-256 pelos instaladores
(`npm/`, `scripts/install.sh`, `scripts/install.ps1`).
