import fs from "node:fs";
import { llmRequests, trigger } from "../support/api";
import { configPath } from "../support/env";
import { expect, test } from "../support/fixtures";

test("trocar o modelo grava provider.model e vale para a próxima melhoria", async ({ page, request, openModal }) => {
  await openModal();
  const picker = page.getByRole("combobox", { name: "Modelo" });
  await expect(picker.locator("option")).toHaveText(["fake-a", "fake-b"]);
  await picker.selectOption("fake-b");

  await expect.poll(() => fs.readFileSync(configPath(), "utf8")).toContain('model: "fake-b"');
  const yaml = fs.readFileSync(configPath(), "utf8");
  expect(yaml).toContain('base_url: "http://127.0.0.1:18766/v1"'); // resto intacto
  await expect(page.getByText(/Não foi possível registrar o atalho/)).toHaveCount(0);

  await trigger(request, "abc");
  await page.getByRole("option", { name: "Melhorar prompt" }).click();
  await expect(page.getByText("Texto melhorado pelo fake.")).toBeVisible();
  expect((await llmRequests(request)).at(-1)!.model).toBe("fake-b");
});
