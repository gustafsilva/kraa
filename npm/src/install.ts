// Baixa do GitHub Release o binário da versão igual à do package.json,
// confere o SHA-256 contra o checksums.txt e instala em installDir.
// Usado pelo `postinstall` (nunca falha o `npm i`) e por `kraa install`.
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { realExec, type Exec } from "./exec";
import { readPackageJson } from "./pkg";
import {
  assetName,
  assetUrl,
  binaryPath,
  checksumsUrl,
  installDir,
  resolveRepo,
  type Env,
} from "./platform";

export interface InstallDeps {
  platform: NodeJS.Platform;
  arch: string;
  env: Env;
  home: string;
  version: string;
  repo: string;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  exec: Exec;
  log: (msg: string) => void;
  /** Timeout de cada download (padrão: DOWNLOAD_TIMEOUT_MS). */
  downloadTimeoutMs?: number;
  /** Operações de fs injetáveis nos testes (padrão: node:fs). */
  fs?: Pick<typeof fs, "renameSync">;
}

/** Tempo máximo de cada download (checksums.txt e asset), incluindo o corpo. */
export const DOWNLOAD_TIMEOUT_MS = 120_000;

export function defaultInstallDeps(): InstallDeps {
  const pkg = readPackageJson();
  return {
    platform: process.platform,
    arch: process.arch,
    env: process.env,
    home: os.homedir(),
    version: pkg.version,
    repo: resolveRepo(process.env, pkg.repository),
    fetch: (url, init) => fetch(url, init),
    exec: realExec,
    log: (msg) => console.log(msg),
  };
}

/** Lê o formato do `sha256sum`: `<hex>  <nome>` (ou `<hex> *<nome>`). */
export function parseChecksums(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/);
    if (m) out.set(m[2].trim(), m[1].toLowerCase());
  }
  return out;
}

async function download(d: InstallDeps, url: string): Promise<Buffer> {
  const ms = d.downloadTimeoutMs ?? DOWNLOAD_TIMEOUT_MS;
  // O mesmo sinal cobre a resposta e a leitura do corpo (arrayBuffer).
  const signal = AbortSignal.timeout(ms);
  try {
    const res = await d.fetch(url, { signal });
    if (!res.ok) throw new Error(`download falhou (HTTP ${res.status}): ${url}`);
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    if (signal.aborted) {
      throw new Error(`Tempo esgotado (${ms / 1000}s) ao baixar ${url}`);
    }
    throw err;
  }
}

/** Mensagem quando o binário atual está em uso e não pode ser substituído. */
export const BINARY_IN_USE_MESSAGE =
  "Feche o Kraa (kraa stop) e rode kraa install novamente";

/**
 * Move o binário baixado para o destino. No Windows, renomear por cima de um
 * .exe em execução falha com EPERM/EBUSY; isso vira uma mensagem PT-BR
 * acionável em vez do erro cru do Node.
 */
function replaceBinary(d: InstallDeps, from: string, to: string): void {
  try {
    (d.fs ?? fs).renameSync(from, to);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | null)?.code;
    if (code === "EPERM" || code === "EBUSY") {
      throw new Error(`Não foi possível substituir ${to}: o arquivo está em uso. ${BINARY_IN_USE_MESSAGE}.`);
    }
    throw err;
  }
}

function skipDownload(env: Env): boolean {
  const v = env.KRAA_SKIP_DOWNLOAD;
  return !!v && v !== "0" && v.toLowerCase() !== "false";
}

export async function install(d: InstallDeps): Promise<"skipped" | "installed"> {
  if (skipDownload(d.env)) {
    d.log("KRAA_SKIP_DOWNLOAD definido: download do binário ignorado.");
    return "skipped";
  }

  const asset = assetName(d.platform, d.arch);
  const target = installDir(d.platform, d.env, d.home);
  d.log(`Baixando Kraa v${d.version} (${asset})...`);

  const sums = parseChecksums((await download(d, checksumsUrl(d.repo, d.version))).toString("utf8"));
  const expected = sums.get(asset);
  if (!expected) throw new Error(`${asset} não aparece no checksums.txt do release v${d.version}`);

  // O diretório temporário fica no mesmo sistema de arquivos do destino,
  // para o rename final ser atômico; ele é sempre removido no finally,
  // levando junto qualquer arquivo parcial.
  const stagingParent = d.platform === "darwin" ? path.dirname(target) : target;
  fs.mkdirSync(stagingParent, { recursive: true });
  const staging = fs.mkdtempSync(path.join(stagingParent, ".kraa-download-"));
  try {
    const file = path.join(staging, asset);
    fs.writeFileSync(file, await download(d, assetUrl(d.repo, d.version, asset)));

    const actual = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    if (actual !== expected) {
      fs.rmSync(file, { force: true });
      throw new Error(
        `SHA-256 não confere para ${asset} (esperado ${expected}, obtido ${actual}); instalação abortada.`,
      );
    }

    if (d.platform === "darwin") {
      const out = path.join(staging, "app");
      fs.mkdirSync(out);
      await d.exec("ditto", ["-x", "-k", file, out]);
      const bundle = fs.readdirSync(out).find((n) => n.endsWith(".app"));
      if (!bundle) throw new Error(`o zip ${asset} não contém um .app`);
      fs.rmSync(target, { recursive: true, force: true });
      fs.renameSync(path.join(out, bundle), target);
    } else {
      const bin = binaryPath(d.platform, d.env, d.home);
      fs.chmodSync(file, 0o755);
      replaceBinary(d, file, bin);
    }
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }

  d.log(`Kraa instalado em ${target}`);
  return "installed";
}

function warnDownloadFailed(log: (msg: string) => void, err: unknown): void {
  log(
    `\n[kraa] Aviso: Não foi possível baixar o binário do Kraa ` +
      `(${err instanceof Error ? err.message : String(err)}).\n` +
      "O pacote npm foi instalado mesmo assim. Quando tiver conexão, rode:\n\n" +
      "    kraa install\n",
  );
}

/** Nunca falha o `npm i`: em erro, só avisa e sai com 0. */
export async function postinstall(d: InstallDeps): Promise<number> {
  try {
    await install(d);
  } catch (err) {
    warnDownloadFailed(d.log, err);
  }
  return 0;
}

/**
 * Entrada do `postinstall`: também captura erros ao montar as dependências
 * (ex.: package.json ilegível), para o `npm i` nunca falhar.
 */
export async function runPostinstall(
  makeDeps: () => InstallDeps = defaultInstallDeps,
  log: (msg: string) => void = (msg) => console.log(msg),
): Promise<number> {
  try {
    return await postinstall(makeDeps());
  } catch (err) {
    warnDownloadFailed(log, err);
    return 0;
  }
}

if (require.main === module) {
  runPostinstall().then(
    () => process.exit(0),
    () => process.exit(0),
  );
}
