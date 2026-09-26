export const REPO = "gustafsilva/prompt-improve-beta";
export const REPO_URL = `https://github.com/${REPO}`;
export const NPM_URL = "https://www.npmjs.com/package/prompt-improve";
export const INSTALL_CMD = "npm i -g prompt-improve && prompt-improve start";

/** Caminho interno com o `base` do site (GitHub Pages serve em /<repo>/). */
export function href(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export interface NavItem {
  title: string;
  slug: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/** Ordem da barra lateral; cada `slug` é o caminho do .mdx em src/content/docs. */
export const NAV: NavSection[] = [
  {
    title: "Começando",
    items: [
      { title: "Introdução", slug: "introducao" },
      { title: "Primeiros passos", slug: "uso/primeiros-passos" },
    ],
  },
  {
    title: "Instalação",
    items: [
      { title: "Via npm", slug: "instalacao/npm" },
      { title: "Via script", slug: "instalacao/script" },
      { title: "Ollama", slug: "instalacao/ollama" },
      { title: "Binários sem assinatura", slug: "instalacao/binarios-sem-assinatura" },
    ],
  },
  {
    title: "Uso",
    items: [
      { title: "Atalhos", slug: "uso/atalhos" },
      { title: "Seletor de modelo", slug: "uso/seletor-de-modelo" },
      { title: "Perfil do usuário", slug: "uso/perfil-do-usuario" },
    ],
  },
  {
    title: "Configuração",
    items: [
      { title: "O arquivo config.yaml", slug: "configuracao/arquivo" },
      { title: "Providers", slug: "configuracao/providers" },
      { title: "Ações customizadas", slug: "configuracao/acoes-customizadas" },
    ],
  },
  {
    title: "Referência",
    items: [{ title: "CLI prompt-improve", slug: "referencia/cli" }],
  },
  {
    title: "Plataformas",
    items: [
      { title: "macOS", slug: "plataformas/macos" },
      { title: "Windows", slug: "plataformas/windows" },
      { title: "Linux", slug: "plataformas/linux" },
      { title: "Privacidade", slug: "plataformas/privacidade" },
    ],
  },
  {
    title: "Ajuda",
    items: [
      { title: "Solução de problemas", slug: "ajuda/solucao-de-problemas" },
      { title: "FAQ", slug: "ajuda/faq" },
    ],
  },
  {
    title: "Contribuir",
    items: [
      { title: "Ambiente de desenvolvimento", slug: "contribuir/ambiente" },
      { title: "Arquitetura", slug: "contribuir/arquitetura" },
      { title: "Testes", slug: "contribuir/testes" },
      { title: "Release", slug: "contribuir/release" },
    ],
  },
];

export const FLAT_NAV = NAV.flatMap((s) => s.items);
