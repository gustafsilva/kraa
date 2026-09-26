// Regras puras (sem efeitos colaterais) de plataforma: nome do asset do
// release, diretórios de instalação e de configuração, repo e URLs. Tudo
// recebe platform/env/home por parâmetro para ser testável em qualquer SO.
import path from "node:path";

export type Env = Record<string, string | undefined>;

export const APP_ID = "dev.matrixia.prompt-improve";
export const APP_NAME = "Prompt Improve";
export const BIN_NAME = "prompt-improve";
export const DEFAULT_REPO = "gustavofreitas/prompt-improve";

/** path.win32 no Windows e path.posix nos demais, independente do SO do host. */
export function pathFor(platform: NodeJS.Platform): path.PlatformPath {
  return platform === "win32" ? path.win32 : path.posix;
}

/** Nome do arquivo publicado no GitHub Release para a combinação SO/arquitetura. */
export function assetName(platform: NodeJS.Platform, arch: string): string {
  if (platform === "darwin" && (arch === "x64" || arch === "arm64")) {
    return "prompt-improve-darwin-universal.app.zip";
  }
  if (platform === "win32" && arch === "x64") {
    return "prompt-improve-windows-amd64.exe";
  }
  if (platform === "linux" && arch === "x64") {
    return "prompt-improve-linux-amd64";
  }
  if (platform === "linux" && arch === "arm64") {
    return "prompt-improve-linux-arm64";
  }
  throw new Error(
    `A plataforma ${platform}/${arch} não é suportada pelo Prompt Improve ` +
      "(suportadas: macOS x64/arm64, Windows x64, Linux x64/arm64).",
  );
}

function localAppData(env: Env, home: string): string {
  return env.LOCALAPPDATA || path.win32.join(home, "AppData", "Local");
}

/**
 * Onde o app fica instalado.
 * - macOS: o bundle `~/Applications/Prompt Improve.app`;
 * - Windows: a pasta `%LOCALAPPDATA%\prompt-improve`;
 * - Linux: a pasta `~/.local/share/prompt-improve`.
 */
export function installDir(platform: NodeJS.Platform, env: Env, home: string): string {
  switch (platform) {
    case "darwin":
      return path.posix.join(home, "Applications", `${APP_NAME}.app`);
    case "win32":
      return path.win32.join(localAppData(env, home), BIN_NAME);
    default:
      return path.posix.join(home, ".local", "share", BIN_NAME);
  }
}

/** Caminho do executável propriamente dito. */
export function binaryPath(platform: NodeJS.Platform, env: Env, home: string): string {
  const dir = installDir(platform, env, home);
  switch (platform) {
    case "darwin":
      return path.posix.join(dir, "Contents", "MacOS", BIN_NAME);
    case "win32":
      return path.win32.join(dir, `${BIN_NAME}.exe`);
    default:
      return path.posix.join(dir, BIN_NAME);
  }
}

/** Mesmas regras do `os.UserConfigDir()` do Go. */
export function configDir(platform: NodeJS.Platform, env: Env, home: string): string {
  switch (platform) {
    case "darwin":
      return path.posix.join(home, "Library", "Application Support");
    case "win32": {
      const dir = env.APPDATA;
      if (!dir) throw new Error("%AppData% não está definido");
      return dir;
    }
    default: {
      const dir = env.XDG_CONFIG_HOME;
      if (!dir) return path.posix.join(home, ".config");
      if (!path.posix.isAbsolute(dir)) {
        throw new Error("o caminho em $XDG_CONFIG_HOME precisa ser absoluto");
      }
      return dir;
    }
  }
}

export function configPath(platform: NodeJS.Platform, env: Env, home: string): string {
  return pathFor(platform).join(configDir(platform, env, home), BIN_NAME, "config.yaml");
}

type Repository = string | { type?: string; url?: string } | undefined;

/** "owner/repo": PROMPT_IMPROVE_REPO ou o `repository` do package.json. */
export function resolveRepo(env: Env, repository: Repository): string {
  if (env.PROMPT_IMPROVE_REPO) return env.PROMPT_IMPROVE_REPO;
  const raw = typeof repository === "string" ? repository : repository?.url ?? "";
  const m = raw.match(/^(?:github:)?([\w.-]+\/[\w.-]+?)(?:\.git)?$/) ??
    raw.match(/github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?$/);
  return m ? m[1] : DEFAULT_REPO;
}

export function assetUrl(repo: string, version: string, asset: string): string {
  return `https://github.com/${repo}/releases/download/v${version}/${asset}`;
}

export function checksumsUrl(repo: string, version: string): string {
  return assetUrl(repo, version, "checksums.txt");
}
