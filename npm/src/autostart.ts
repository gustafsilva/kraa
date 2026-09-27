// "Iniciar com o sistema": LaunchAgent (macOS), chave Run do registro
// (Windows) e autostart do XDG (Linux). A geração de conteúdo é pura; a
// escrita recebe HOME/env/exec por injeção.
import fs from "node:fs";
import path from "node:path";
import type { Exec } from "./exec";
import { APP_ID, APP_NAME, BIN_NAME, binaryPath, configDir, installDir, type Env } from "./platform";

export const REG_RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
export const REG_VALUE = "Kraa";

const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function launchAgentPlist(appPath: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${APP_ID}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/open</string>
    <string>-a</string>
    <string>${xmlEscape(appPath)}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
`;
}

/** Aspas no Exec conforme a Desktop Entry Specification. */
function desktopQuote(arg: string): string {
  return `"${arg.replace(/[\\"`$]/g, (c) => `\\${c}`)}"`;
}

export function desktopEntry(binPath: string): string {
  return [
    "[Desktop Entry]",
    "Type=Application",
    `Name=${APP_NAME}`,
    "Comment=Melhora o texto selecionado via LLM",
    `Exec=${desktopQuote(binPath)}`,
    "Terminal=false",
    "X-GNOME-Autostart-enabled=true",
    "",
  ].join("\n");
}

export function regAddArgs(exePath: string): string[] {
  return ["add", REG_RUN_KEY, "/v", REG_VALUE, "/t", "REG_SZ", "/d", `"${exePath}"`, "/f"];
}

export function regDeleteArgs(): string[] {
  return ["delete", REG_RUN_KEY, "/v", REG_VALUE, "/f"];
}

/** Arquivo de autostart no macOS/Linux (no Windows é o registro). */
export function autostartPath(platform: NodeJS.Platform, env: Env, home: string): string {
  if (platform === "darwin") {
    return path.posix.join(home, "Library", "LaunchAgents", `${APP_ID}.plist`);
  }
  return path.posix.join(configDir(platform, env, home), "autostart", `${BIN_NAME}.desktop`);
}

export interface AutostartDeps {
  platform: NodeJS.Platform;
  env: Env;
  home: string;
  exec: Exec;
}

export async function setAutostart(enabled: boolean, d: AutostartDeps): Promise<void> {
  if (d.platform === "win32") {
    const exe = binaryPath(d.platform, d.env, d.home);
    if (enabled) {
      await d.exec("reg", regAddArgs(exe));
    } else {
      // `reg delete` falha quando o valor não existe; desligar é idempotente.
      await d.exec("reg", regDeleteArgs()).catch(() => {});
    }
    return;
  }

  const file = autostartPath(d.platform, d.env, d.home);
  if (!enabled) {
    fs.rmSync(file, { force: true });
    return;
  }
  const content =
    d.platform === "darwin"
      ? launchAgentPlist(installDir(d.platform, d.env, d.home))
      : desktopEntry(binaryPath(d.platform, d.env, d.home));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
