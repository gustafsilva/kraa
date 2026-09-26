import { visit } from "unist-util-visit";

/**
 * Prefixa links absolutos internos (`/docs/...`) do MDX com o `base` do site,
 * para que os .mdx possam usar caminhos limpos e continuar válidos no GitHub Pages.
 * @param {{ base: string }} options
 */
export function rehypeBaseLinks({ base }) {
  const prefix = base.replace(/\/$/, "");
  return (tree) => {
    if (!prefix) return;
    visit(tree, "element", (node) => {
      for (const attr of ["href", "src"]) {
        const value = node.properties?.[attr];
        if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith(prefix + "/")) {
          node.properties[attr] = prefix + value;
        }
      }
    });
  };
}
