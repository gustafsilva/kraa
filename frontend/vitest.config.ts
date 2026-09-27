import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const src = (p: string) => path.resolve(import.meta.dirname, "./src", p);

// Dedicated Vitest config (kept separate from vite.config.ts) so the
// @wailsio/runtime typed-events Vite plugin — which requires generated
// bindings to be present and wired for a real build — never runs during
// unit tests. The Wails runtime and the ImproveService binding are aliased
// to in-memory mocks for every test (no per-file vi.mock needed).
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@wailsio\/runtime$/, replacement: src("test/wailsRuntimeMock.ts") },
      {
        find: /^@bindings\/github\.com\/gustavofreitas\/kraa\/internal\/app$/,
        replacement: src("test/improveServiceMock.ts"),
      },
      { find: "@bindings", replacement: path.resolve(import.meta.dirname, "./bindings") },
      { find: "@", replacement: path.resolve(import.meta.dirname, "./src") },
    ],
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
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/components/ui/**", "src/test/**", "src/**/*.test.{ts,tsx}", "src/vite-env.d.ts", "src/main.tsx"],
      reporter: ["text-summary", "html"],
      // Floors measured on 2026-09-27 (92.38/87.15/90.09/92.8). Raise, never lower.
      thresholds: { statements: 92, branches: 87, functions: 90, lines: 92 },
    },
  },
});
