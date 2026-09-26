import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Dedicated Vitest config (kept separate from vite.config.ts) so the
// @wailsio/runtime typed-events Vite plugin — which requires generated
// bindings to be present and wired for a real build — never runs during
// unit tests.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@bindings": path.resolve(import.meta.dirname, "./bindings"),
    },
  },
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // @testing-library/react only auto-registers its afterEach(cleanup) when
    // it finds a *global* `afterEach` (it does a bare `typeof afterEach`
    // check) — without this, DOM from one test leaks into the next.
    globals: true,
  },
});
