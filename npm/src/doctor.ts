// `kraa doctor`: diagnóstico rápido do ambiente.
import fs from "node:fs";
import path from "node:path";
import { binaryPath, configPath, type Env } from "./platform";

export const DEFAULT_BASE_URL = "http://localhost:11434/v1";
const TIMEOUT_MS = 3000;

/** Extrai o `base_url:` do config.yaml sem depender de um parser YAML. */
export function readBaseUrl(yaml: string): string | undefined {
  const m = yaml.match(/^[ \t]*base_url:[ \t]*(?:"([^"]*)"|'([^']*)'|([^\s#]+))/m);
  const value = m && (m[1] ?? m[2] ?? m[3]);
  return value || undefined;
}

export interface DoctorDeps {
  platform: NodeJS.Platform;
  env: Env;
  home: string;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  commandExists: (name: string) => Promise<boolean>;
  log: (msg: string) => void;
}

/** Procura um executável no PATH sem criar processos. */
export async function realCommandExists(name: string, env: Env = process.env): Promise<boolean> {
  const exts = process.platform === "win32" ? (env.PATHEXT ?? ".EXE").split(";") : [""];
  for (const dir of (env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      try {
        fs.accessSync(path.join(dir, name + ext), fs.constants.X_OK);
        return true;
      } catch {
        // tenta o próximo
      }
    }
  }
  return false;
}

/** Retorna true quando o binário existe e o provider respondeu. */
export async function doctor(d: DoctorDeps): Promise<boolean> {
  let ok = true;
  d.log("Kraa — diagnóstico\n");

  const bin = binaryPath(d.platform, d.env, d.home);
  if (fs.existsSync(bin)) {
    d.log(`[ok] Binário instalado: ${bin}`);
  } else {
    ok = false;
    d.log(`[erro] Binário não encontrado em ${bin}`);
    d.log("       Rode `kraa install` para baixá-lo.");
  }

  let baseUrl = DEFAULT_BASE_URL;
  let cfg: string | undefined;
  try {
    cfg = configPath(d.platform, d.env, d.home);
    const fromFile = readBaseUrl(fs.readFileSync(cfg, "utf8"));
    if (fromFile) baseUrl = fromFile;
    d.log(`[ok] Configuração: ${cfg}`);
  } catch {
    d.log(
      `[aviso] Configuração não encontrada${cfg ? ` em ${cfg}` : ""}; ` +
        `usando o base_url padrão (${DEFAULT_BASE_URL}). O app cria o arquivo na primeira execução.`,
    );
  }

  const url = `${baseUrl.replace(/\/+$/, "")}/models`;
  try {
    const res = await d.fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.ok) {
      d.log(`[ok] Provider respondeu em ${url}`);
    } else {
      d.log(`[aviso] Provider respondeu HTTP ${res.status} em ${url} (confira base_url e api_key).`);
    }
  } catch (err) {
    ok = false;
    const cause = (err as Error & { cause?: Error }).cause?.message ?? (err as Error).message;
    d.log(`[erro] Não foi possível conectar em ${url} (${cause}).`);
    d.log("       Se estiver usando o Ollama local, inicie o servidor com: ollama serve");
  }

  if (d.platform === "linux") {
    if (await d.commandExists("xdotool")) {
      d.log("[ok] xdotool encontrado.");
    } else {
      d.log("[aviso] xdotool não encontrado: sem colagem automática no X11 (sudo apt install xdotool).");
    }
    if (d.env.XDG_SESSION_TYPE === "wayland" || d.env.WAYLAND_DISPLAY) {
      d.log(
        "[aviso] Sessão Wayland: só \"Copiar\" fica disponível. Configure um atalho do sistema " +
          "apontando para `kraa trigger`.",
      );
    } else {
      d.log("[ok] Sessão X11.");
    }
  }

  if (d.platform === "darwin") {
    d.log(
      "[info] A permissão de Acessibilidade é verificada pelo próprio app: sem ela, o modal mostra " +
        "um aviso (Ajustes do Sistema › Privacidade e Segurança › Acessibilidade).",
    );
  }

  return ok;
}
