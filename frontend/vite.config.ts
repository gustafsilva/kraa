import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import wails from "@wailsio/runtime/plugins/vite";

// frontend/dist/.gitkeep is tracked so `//go:embed all:frontend/dist` in
// main.go compiles on a clean checkout (CI runs go vet/go test before any
// frontend build). vite's emptyOutDir wipes it on every build, which would
// show up as a deleted tracked file in `git status`, so it is recreated once
// the bundle is written. emptyOutDir itself stays on so stale hashed assets
// never pile up in dist/ (and in the embedded binary).
function keepDistPlaceholder(): Plugin {
  let outDir = "";
  return {
    name: "keep-dist-gitkeep",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, ".gitkeep"), "");
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: Number(process.env.WAILS_VITE_PORT) || 9245,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@bindings": path.resolve(import.meta.dirname, "./bindings"),
    },
  },
  plugins: [react(), tailwindcss(), wails("./bindings"), keepDistPlaceholder()],
});
