---
name: release
description: Use quando o mantenedor pedir para lançar, publicar ou "fazer a release" de uma nova versão do Kraa (tag vX.Y.Z, GitHub Release, pacote npm @gustavofsilva/kraa).
argument-hint: "[versão, ex.: 0.2.0]"
disable-model-invocation: true
---

# Release do Kraa

Uma tag `vX.Y.Z` dispara o `.github/workflows/release.yml`: builda as 4 plataformas, publica o
GitHub Release (imutável) e envia o pacote npm para o **staging**. Só o mantenedor aprova o npm,
com 2FA. Detalhes em `site/src/content/docs/contribuir/release.mdx`.

**Push e tag são irreversíveis:** um release publicado trava a tag para sempre.

## 1. Conferir (somente leitura)

- `git switch main && git fetch origin && git status -sb`: `main` igual a `origin/main`.
- CI verde na `main`: `gh run list -R gustafsilva/kraa --branch main --limit 3`.
- `CHANGELOG.md`: se `## [Não lançado]` estiver vazio, pare e avise; não há o que lançar.
- Versão: use a do argumento. Sem argumento, proponha pelo CHANGELOG (projeto em `0.x`): só
  `### Corrigido` → patch (`0.1.0` → `0.1.1`); qualquer outra seção (`Adicionado`, `Alterado`,
  `Removido`) → minor (`0.1.0` → `0.2.0`). A tag não pode existir: `git tag -l vX.Y.Z` vazio.

## 2. Preparar o commit

```bash
(cd npm && npm version X.Y.Z --no-git-tag-version --ignore-scripts)
```

No `CHANGELOG.md`: abaixo de um `## [Não lançado]` vazio, crie `## [X.Y.Z] - AAAA-MM-DD` (data
de hoje) com os itens que estavam em "Não lançado". No fim do arquivo:
`[Não lançado]: https://github.com/gustafsilva/kraa/compare/vX.Y.Z...HEAD` e
`[X.Y.Z]: https://github.com/gustafsilva/kraa/releases/tag/vX.Y.Z` (acima das versões antigas).

Verifique: `go test ./...` (Linux: `-tags gtk3`), `npm --prefix frontend test`,
`npm --prefix npm test`.

Faça commit só de `npm/package.json`, `npm/package-lock.json` e `CHANGELOG.md`:
`chore(release): vX.Y.Z`. Outros arquivos modificados no working tree ficam fora.

## 3. Confirmar com o mantenedor

Mostre a versão, o diff do CHANGELOG e o resultado dos testes, e **pergunte se pode fazer o push
e criar a tag**. Sem um "sim" explícito, pare aqui.

## 4. Publicar

```bash
git push origin main
git tag -a vX.Y.Z -m vX.Y.Z && git push origin vX.Y.Z
gh run watch -R gustafsilva/kraa --exit-status   # a execução da tag
```

Confira `gh release view vX.Y.Z -R gustafsilva/kraa`: 4 binários + `checksums.txt`.

## 5. Entregar a aprovação ao mantenedor

O agente não aprova o npm (exige o 2FA do mantenedor). Termine com:

```bash
npm stage list @gustavofsilva/kraa
npm stage approve <stage-id>        # npm >= 11.15; ou pela página do pacote
npm view @gustavofsilva/kraa version
```

## Se o workflow falhar

| Situação | O que fazer |
|---|---|
| Falhou **antes** do job "Publica o GitHub Release" (nenhum release em `gh release list`) | Corrija na `main`, confirme com o mantenedor, apague e recrie a tag: `git push origin :refs/tags/vX.Y.Z && git tag -d vX.Y.Z`, depois o passo 4 |
| Release **já publicado** (imutável) | A tag não pode ser reutilizada. Corrija e lance a próxima patch (`X.Y.Z+1`) desde o passo 1 |
| Só o job `publish-npm` falhou | O GitHub Release está certo. Envie o link da execução ao mantenedor; erros de OIDC/trusted publisher se resolvem no npmjs.com e com "Re-run failed jobs" |
