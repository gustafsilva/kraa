import { test as base, expect, type Page } from "@playwright/test";
import { resetAll } from "./api";

/** Opens the modal and waits for the events WebSocket, so selection:new isn't missed. */
async function openModal(page: Page, path = "/") {
  const connected = page.waitForEvent("console", (m) => m.text().includes("Event WebSocket connected"));
  await page.goto(path);
  await connected;
}

export const test = base.extend<{ openModal: (path?: string) => Promise<void> }>({
  openModal: async ({ page, request }, use) => {
    await resetAll(request);
    await use((path) => openModal(page, path));
  },
});

export { expect };
