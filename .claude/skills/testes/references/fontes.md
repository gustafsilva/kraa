# Fontes (pesquisadas em 2026-09-27)

As regras da skill vêm primeiro do que foi aprendido neste repo (plano
`docs/superpowers/plans/2026-09-27-camada-de-testes.md` e o registro de aprendizados da
execução); as fontes abaixo confirmam ou complementam.

## Go
- Go 1.25 release notes (`testing/synctest` GA, `T.Attr`, `T.Output`): https://go.dev/doc/go1.25
- Pacote `testing/synctest` (bolha, relógio virtual, *durably blocked*, rede não conta): https://pkg.go.dev/testing/synctest
- Testing concurrent code with testing/synctest: https://go.dev/blog/synctest
- Table-driven tests: https://go.dev/wiki/TableDrivenTests
- Subtests (`t.Run`, `t.Parallel` em subtestes): https://go.dev/blog/subtests
- Fuzzing: https://go.dev/doc/tutorial/fuzz
- Golden files / file-driven testing: https://eli.thegreenplace.net/2022/file-driven-testing-in-go/ e https://matttproud.com/blog/posts/golden-file-testing.html

## Testing Library / Vitest
- Prioridade de queries (`getByRole` primeiro, `getByTestId` por último): https://testing-library.com/docs/queries/about/
- `userEvent.setup()` antes do render, fora de hooks: https://testing-library.com/docs/user-event/intro
- Erros comuns (act desnecessário, query errada, `waitFor` mal usado): https://kentcdodds.com/blog/common-mistakes-with-react-testing-library
- Cobertura e `coverage.thresholds` (inclui `autoUpdate`, `perFile`): https://vitest.dev/config/coverage

## Playwright
- Best practices (locators por papel, isolamento, web-first assertions, trace no CI): https://playwright.dev/docs/best-practices
- Assertions (auto-retry, `expect.poll`): https://playwright.dev/docs/test-assertions

## Manutenção
- Eradicating Non-Determinism in Tests (quarentena com prazo, isolamento, tempo, async): https://martinfowler.com/articles/nonDeterminism.html
- Test Flakiness (Google Testing Blog): https://testing.googleblog.com/2020/12/test-flakiness-one-of-main-challenges.html
- Code Coverage Best Practices (cobertura como piso e sinal, não meta): https://testing.googleblog.com/2020/08/code-coverage-best-practices.html
- Testing Trophy (peso maior na integração, estático na base): https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications
