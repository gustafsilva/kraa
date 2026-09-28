import { allContent, e2eState, llmRequests, setScenario, trigger } from "../support/api";
import { expect, test } from "../support/fixtures";

test("versões: ação → refinar → navegar → gerar de novo → substituir a versão escolhida", async ({ page, request, openModal }) => {
  await openModal();
  await trigger(request, "fala galera, bora remarcar");

  await setScenario(request, { chunks: ["Versão A"] });
  await page.getByRole("option", { name: "Melhorar prompt" }).click();
  await expect(page.getByText("1/1")).toBeVisible();

  await setScenario(request, { chunks: ["Versão B"] });
  const refine = page.getByRole("textbox", { name: "Refinar" });
  await refine.fill("mais curto");
  await refine.press("Enter");
  await expect(page.getByText("2/2")).toBeVisible();

  let reqs = await llmRequests(request);
  expect(allContent(reqs[1])).toContain("Aplique somente este ajuste: mais curto");
  expect(allContent(reqs[1])).toContain("Versão A");

  await page.getByRole("button", { name: "Versão anterior" }).click();
  await expect(page.getByText("1/2")).toBeVisible();

  await setScenario(request, { chunks: ["Versão C"] });
  await page.getByRole("button", { name: "Gerar de novo" }).click();
  await expect(page.getByText("3/3")).toBeVisible();
  reqs = await llmRequests(request);
  expect(allContent(reqs[2])).toContain("<versao_anterior>\nVersão A\n</versao_anterior>");

  await page.getByRole("button", { name: "Versão anterior" }).click();
  await page.getByRole("button", { name: "Versão anterior" }).click();
  await expect(page.getByText("1/3")).toBeVisible();
  await page.getByRole("button", { name: /Substituir/ }).click();
  await expect.poll(async () => (await e2eState(request)).pasted.at(-1)).toBe("Versão A");
});

test("saída vazia do modelo vira erro e não cria versão", async ({ page, request, openModal }) => {
  await openModal();
  await trigger(request, "abc");
  await setScenario(request, { chunks: ["   "] });
  await page.getByRole("option", { name: "Melhorar prompt" }).click();
  await expect(page.getByText("O modelo não retornou texto. Tente novamente.")).toBeVisible();
  await expect(page.getByText("1/1")).toHaveCount(0);
});

test("429 do provedor mostra mensagem legível", async ({ page, request, openModal }) => {
  await openModal();
  await trigger(request, "abc");
  await setScenario(request, { status: 429, message: "too many concurrent requests" });
  await page.getByRole("option", { name: "Melhorar prompt" }).click();
  await expect(page.getByText(/excesso de requisições simultâneas/)).toBeVisible();
});
