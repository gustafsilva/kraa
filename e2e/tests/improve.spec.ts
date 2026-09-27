import { allContent, hotkey, llmRequests, trigger } from "../support/api";
import { expect, test } from "../support/fixtures";

const RESULT = "Texto melhorado pelo fake.";

test("seleção capturada → ação → stream no preview", async ({ page, request, openModal }) => {
  await openModal();
  await trigger(request, "texto original do usuário");
  await expect(page.getByRole("textbox", { name: "Texto a melhorar" })).toHaveValue("texto original do usuário");

  await page.getByRole("option", { name: "Melhorar prompt" }).click();
  await expect(page.getByText(RESULT)).toBeVisible();
  await expect(page.getByRole("button", { name: /Substituir/ })).toBeFocused();

  const [req] = await llmRequests(request);
  expect(req.model).toBe("fake-a");
  expect(allContent(req)).toContain("texto original do usuário");
});

test("atalho global registrado abre o modal com a seleção", async ({ page, request, openModal }) => {
  await openModal();
  await hotkey(request, "selecionado pelo atalho");
  await expect(page.getByRole("textbox", { name: "Texto a melhorar" })).toHaveValue("selecionado pelo atalho");
});

test("sem seleção: modal vazio e editável usa o texto digitado", async ({ page, request, openModal }) => {
  await openModal();
  await trigger(request);
  const box = page.getByRole("textbox", { name: "Texto a melhorar" });
  await expect(box).toHaveValue("");
  await box.fill("digitado à mão");
  await page.getByRole("option", { name: "Melhorar prompt" }).click();
  await expect(page.getByText(RESULT)).toBeVisible();
  expect(allContent((await llmRequests(request))[0])).toContain("digitado à mão");
});

test("instrução livre na busca", async ({ page, request, openModal }) => {
  await openModal();
  await trigger(request, "abc");
  await page.getByRole("combobox", { name: "Buscar ação" }).fill("traduza para inglês");
  await page.keyboard.press("Enter");
  await expect(page.getByText(RESULT)).toBeVisible();
  expect(allContent((await llmRequests(request))[0])).toContain("traduza para inglês");
});
