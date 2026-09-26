// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import { rehypeBaseLinks } from "./src/lib/rehype-base-links.mjs";

// Publicado no GitHub Pages do repositório: https://<dono>.github.io/<repo>/.
// SITE_URL/BASE_PATH permitem publicar em outro lugar (ou num fork) sem editar o arquivo.
const site = process.env.SITE_URL ?? "https://gustafsilva.github.io";
const base = process.env.BASE_PATH ?? "/prompt-improve-beta";

export default defineConfig({
  site,
  base,
  trailingSlash: "always",
  integrations: [mdx(), react()],
  markdown: {
    shikiConfig: { theme: "github-dark-default" },
    rehypePlugins: [
      [rehypeBaseLinks, { base }],
      [
        rehypeAutolinkHeadings,
        {
          behavior: "append",
          test: ["h2", "h3"],
          properties: { className: ["heading-anchor"], ariaHidden: "true", tabIndex: -1 },
          content: { type: "text", value: "#" },
        },
      ],
    ],
  },
  vite: { plugins: [tailwindcss()] },
});
