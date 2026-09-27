import fs from "node:fs";
import { allContent, llmRequests, trigger } from "../support/api";
import { configPath } from "../support/env";
import { expect, test } from "../support/fixtures";

test("salvar perfil ativo grava o config e só ações de prompt o recebem", async ({ page, request, openModal }) => {
  await openModal("/?view=profile");
  const about = page.getByRole("textbox", { name: "Sobre você" });
  await about.fill("Sou tester E2E do Kraa");
  await page.getByRole("checkbox", { name: "Usar perfil" }).check();
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect.poll(() => fs.readFileSync(configPath(), "utf8")).toContain("Sou tester E2E do Kraa");

  await openModal("/");
  await trigger(request, "abc");
  await page.getByRole("option", { name: "Melhorar prompt" }).click();
  await expect(page.getByText("Texto melhorado pelo fake.")).toBeVisible();

  await trigger(request, "abc"); // janela visível: só refoca; o texto continua "abc"
  await page.getByRole("option", { name: "Mais formal" }).click();
  await expect.poll(async () => (await llmRequests(request)).length).toBe(2);

  const [withProfile, formal] = await llmRequests(request);
  expect(allContent(withProfile)).toContain("Sou tester E2E do Kraa");
  expect(allContent(formal)).not.toContain("Sou tester E2E do Kraa");
});

test("ativar perfil vazio mostra o erro e mantém a janela", async ({ page, openModal }) => {
  await openModal("/?view=profile");
  await page.getByRole("textbox", { name: "Sobre você" }).fill("");
  await page.getByRole("checkbox", { name: "Usar perfil" }).check();
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Escreva o perfil antes de ativá-lo.")).toBeVisible();
});
