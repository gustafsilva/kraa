import { setScenario, trigger } from "../support/api";
import { expect, test } from "../support/fixtures";

for (const [status, suffix] of [[401, "verifique a api_key"], [404, "verifique o model"]] as const) {
  test(`HTTP ${status} vira mensagem PT-BR`, async ({ page, request, openModal }) => {
    await openModal();
    await setScenario(request, { status, message: "falha do provider" });
    await trigger(request, "abc");
    await page.getByRole("option", { name: "Melhorar prompt" }).click();
    await expect(page.getByText(`falha do provider — ${suffix}`)).toBeVisible();
  });
}

test("erro ao listar modelos mostra só o modelo atual e a mensagem", async ({ page, request, openModal }) => {
  // The fixture already reset everything before the body runs; the scenario
  // must be in place before the page loads (the modal lists models on mount).
  await setScenario(request, { modelsStatus: 500, modelsMessage: "sem modelos" });
  await openModal();
  const picker = page.getByRole("combobox", { name: "Modelo" });
  await expect(picker.locator("option")).toHaveText(["fake-a"]);
  await expect(page.getByRole("status")).toContainText("Não foi possível listar os modelos: sem modelos");
});
