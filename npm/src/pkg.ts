import fs from "node:fs";
import path from "node:path";

export interface PackageJson {
  version: string;
  repository?: string | { type?: string; url?: string };
}

/** Lê o package.json do pacote (funciona tanto de src/ quanto de dist/). */
export function readPackageJson(): PackageJson {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
}
