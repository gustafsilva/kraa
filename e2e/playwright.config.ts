import { defineConfig, devices } from "@playwright/test";
import { KRAA_URL, LLM_PORT, LLM_URL, prepareHome } from "./support/env";

const env = prepareHome();

// One real backend (and one config.yaml) shared by every test, so tests run
// serially and each starts from resetAll() (see support/fixtures.ts).
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: KRAA_URL, trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Closest thing to WKWebView/WebKitGTK the CI can run.
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: [
    {
      command: `go run ../cmd/llmfake -addr 127.0.0.1:${LLM_PORT}`,
      url: `${LLM_URL}/v1/models`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "../bin/kraa-e2e",
      url: `${KRAA_URL}/health`,
      env,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
