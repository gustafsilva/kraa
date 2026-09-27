import { e2eState, llmRequests, setScenario, trigger } from "../support/api";
import { expect, test } from "../support/fixtures";

test("Fechar no meio do stream cancela o pedido sem erro", async ({ page, request, openModal }) => {
  await openModal();
  await setScenario(request, { chunks: ["parcial "], hang: true });
  await trigger(request, "abc");
  await page.getByRole("option", { name: "Melhorar prompt" }).click();
  await expect(page.getByText("parcial")).toBeVisible();

  await page.getByRole("button", { name: "Fechar" }).click();

  await expect.poll(async () => (await llmRequests(request))[0]?.canceled).toBe(true);
  expect((await e2eState(request)).window.hides).toBeGreaterThanOrEqual(1);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
