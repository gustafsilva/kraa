import type { APIRequestContext, Page } from "@playwright/test";
import { e2eState, setClipboard, setSession, trigger } from "../support/api";
import { expect, test } from "../support/fixtures";

const RESULT = "Texto melhorado pelo fake.";

async function improve(page: Page, request: APIRequestContext, selection = "abc") {
  await trigger(request, selection);
  await page.getByRole("option", { name: "Melhorar prompt" }).click();
  await expect(page.getByText(RESULT)).toBeVisible();
}

test("Enter em Substituir cola o resultado e restaura o clipboard", async ({ page, request, openModal }) => {
  await openModal();
  await setClipboard(request, "clipboard do usuário");
  await improve(page, request);
  await page.keyboard.press("Enter"); // foco já está em Substituir

  // Keys.Paste records the paste before platform.Paste's settle + restore,
  // so poll both together until the clipboard is back to the user's value.
  await expect
    .poll(async () => {
      const { pasted, clipboard } = await e2eState(request);
      return { pasted, clipboard };
    })
    .toEqual({ pasted: [RESULT], clipboard: "clipboard do usuário" });
  expect((await e2eState(request)).window.hides).toBeGreaterThanOrEqual(1);
});

test("Copiar põe o resultado no clipboard sem erro", async ({ page, request, openModal }) => {
  await openModal();
  await improve(page, request);
  await page.getByRole("button", { name: /Copiar/ }).click();
  await expect.poll(async () => (await e2eState(request)).clipboard).toBe(RESULT);
  await expect(page.getByText("Não foi possível concluir a ação")).toHaveCount(0);
});

test("sem permissão de colar: Substituir some e o aviso aparece", async ({ page, request, openModal }) => {
  await openModal();
  await setSession(request, false, "Sem permissão de Acessibilidade.");
  // Without simulated keys Host.Trigger can't copy the selection; it
  // pre-fills the modal with the clipboard text instead (service.go:493).
  await setClipboard(request, "abc");
  await improve(page, request);
  await expect(page.getByRole("textbox", { name: "Texto a melhorar" })).toHaveValue("abc");
  await expect(page.getByRole("button", { name: /Substituir/ })).toHaveCount(0);
  await expect(page.getByText("Sem permissão de Acessibilidade.")).toBeVisible();
  await page.getByRole("button", { name: /Copiar/ }).click();
  await expect.poll(async () => (await e2eState(request)).clipboard).toBe(RESULT);
});
