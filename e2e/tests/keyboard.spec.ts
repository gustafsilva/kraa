import { trigger } from "../support/api";
import { expect, test } from "../support/fixtures";

test("fluxo só de teclado: ↓/Enter, foco em Substituir, ←/→, ↑ volta às ações", async ({ page, request, openModal }) => {
  await openModal();
  await trigger(request, "abc");
  const search = page.getByRole("combobox", { name: "Buscar ação" });
  await expect(search).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Texto melhorado pelo fake.")).toBeVisible();

  const replace = page.getByRole("button", { name: /Substituir/ });
  const copy = page.getByRole("button", { name: /Copiar/ });
  await expect(replace).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(copy).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(replace).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(search).toBeFocused();
});
