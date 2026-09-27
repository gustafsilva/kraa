#!/usr/bin/env node
// CLI `kraa`: controla o app instalado pelo pacote npm.
import fs from "node:fs";
import os from "node:os";
import { setAutostart } from "./autostart";
import { doctor, realCommandExists } from "./doctor";
import { realExec, realSpawnDetached, type Exec, type SpawnDetached } from "./exec";
import { install, type InstallDeps } from "./install";
import { readPackageJson } from "./pkg";
import { APP_NAME, BIN_NAME, binaryPath, configPath, installDir, resolveRepo } from "./platform";

export interface CliDeps extends InstallDeps {
  spawnDetached: SpawnDetached;
  commandExists: (name: string) => Promise<boolean>;
}

const USAGE = `Uso: kraa <comando>

Comandos:
  start              Inicia o Kraa em segundo plano
  stop               Encerra o Kraa
  trigger            Dispara a captura no app em execução (o mesmo que --trigger)
  config             Abre o config.yaml no editor
  autostart on|off   Liga/desliga iniciar com o sistema
  doctor             Diagnostica a instalação e a conexão com o LLM
  install            Baixa (de novo) o binário do app para esta versão
  help               Mostra esta ajuda`;

export function defaultCliDeps(): CliDeps {
  const pkg = readPackageJson();
  return {
    platform: process.platform,
    arch: process.arch,
    env: process.env,
    home: os.homedir(),
    version: pkg.version,
    repo: resolveRepo(process.env, pkg.repository),
    fetch: (url, init?: RequestInit) => fetch(url, init),
    exec: realExec,
    spawnDetached: realSpawnDetached,
    commandExists: (name) => realCommandExists(name),
    log: (msg) => console.log(msg),
  };
}

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));

function isInstalled(d: CliDeps): boolean {
  return fs.existsSync(binaryPath(d.platform, d.env, d.home));
}

function requireInstalled(d: CliDeps): boolean {
  if (isInstalled(d)) return true;
  d.log(`[erro] Binário não encontrado em ${binaryPath(d.platform, d.env, d.home)}.`);
  d.log("       Rode `kraa install` para baixá-lo.");
  return false;
}

async function start(d: CliDeps): Promise<number> {
  if (!isInstalled(d)) {
    d.log("Binário ainda não instalado; baixando agora...");
    try {
      await install(d);
    } catch (err) {
      d.log(`[erro] ${errMsg(err)}`);
      return 1;
    }
    if (!requireInstalled(d)) return 1;
  }
  if (d.platform === "darwin") {
    d.spawnDetached("open", ["-a", installDir(d.platform, d.env, d.home)]);
  } else {
    d.spawnDetached(binaryPath(d.platform, d.env, d.home), []);
  }
  d.log(`${APP_NAME} iniciado (ícone na bandeja do sistema).`);
  return 0;
}

async function stop(d: CliDeps): Promise<number> {
  const [cmd, args]: [string, string[]] =
    d.platform === "darwin"
      ? ["osascript", ["-e", `quit app "${APP_NAME}"`]]
      : d.platform === "win32"
        ? ["taskkill", ["/IM", `${BIN_NAME}.exe`, "/F"]]
        : ["pkill", ["-x", BIN_NAME]];
  try {
    await d.exec(cmd, args);
  } catch {
    d.log(`${APP_NAME} não parece estar em execução.`);
    return 1;
  }
  d.log(`${APP_NAME} encerrado.`);
  return 0;
}

function trigger(d: CliDeps): number {
  if (!requireInstalled(d)) return 1;
  if (d.platform === "darwin") {
    // -n força uma nova instância: sem ele, com o app já aberto, o `open`
    // só o ativa e descarta os --args. A nova instância repassa o
    // --trigger para a que já está rodando (single-instance) e sai.
    d.spawnDetached("open", ["-n", "-a", installDir(d.platform, d.env, d.home), "--args", "--trigger"]);
  } else {
    d.spawnDetached(binaryPath(d.platform, d.env, d.home), ["--trigger"]);
  }
  return 0;
}

function config(d: CliDeps): number {
  const file = configPath(d.platform, d.env, d.home);
  d.log(`Configuração: ${file}`);
  if (!fs.existsSync(file)) {
    d.log("O arquivo ainda não existe: ele é criado na primeira execução do app (`kraa start`).");
    return 1;
  }
  if (d.platform === "darwin") d.spawnDetached("open", ["-t", file]);
  else if (d.platform === "win32") d.spawnDetached("notepad", [file]);
  else d.spawnDetached("xdg-open", [file]);
  return 0;
}

async function autostart(arg: string | undefined, d: CliDeps): Promise<number> {
  if (arg !== "on" && arg !== "off") {
    d.log("Uso: kraa autostart on|off");
    return 2;
  }
  try {
    await setAutostart(arg === "on", { platform: d.platform, env: d.env, home: d.home, exec: d.exec });
  } catch (err) {
    d.log(`[erro] Não foi possível alterar o início automático: ${errMsg(err)}`);
    return 1;
  }
  d.log(arg === "on" ? `${APP_NAME} vai iniciar com o sistema.` : "Início automático desligado.");
  if (arg === "on" && !isInstalled(d)) {
    d.log("[aviso] O binário ainda não está instalado; rode `kraa install`.");
  }
  return 0;
}

export async function run(argv: string[], d: CliDeps): Promise<number> {
  const [cmd, arg] = argv;
  switch (cmd) {
    case undefined:
    case "help":
    case "-h":
    case "--help":
      d.log(USAGE);
      return 0;
    case "-v":
    case "--version":
    case "version":
      d.log(d.version);
      return 0;
    case "start":
      return start(d);
    case "stop":
      return stop(d);
    case "trigger":
    case "--trigger":
      return trigger(d);
    case "config":
      return config(d);
    case "autostart":
      return autostart(arg, d);
    case "doctor":
      return (await doctor(d)) ? 0 : 1;
    case "install":
      try {
        await install(d);
        return 0;
      } catch (err) {
        d.log(`[erro] ${errMsg(err)}`);
        return 1;
      }
    default:
      d.log(`Comando desconhecido: ${cmd}\n\n${USAGE}`);
      return 2;
  }
}

if (require.main === module) {
  run(process.argv.slice(2), defaultCliDeps()).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error(`[erro] ${errMsg(err)}`);
      process.exitCode = 1;
    },
  );
}
