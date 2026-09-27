import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const KRAA_PORT = 18765;
export const LLM_PORT = 18766;
export const KRAA_URL = `http://127.0.0.1:${KRAA_PORT}`;
export const LLM_URL = `http://127.0.0.1:${LLM_PORT}`;

// Where os.UserConfigDir() lands for HOME/XDG_CONFIG_HOME/APPDATA below.
function configDir(home: string): string {
  switch (process.platform) {
    case "darwin":
      return path.join(home, "Library", "Application Support", "kraa");
    case "win32":
      return path.join(home, "AppData", "Roaming", "kraa");
    default:
      return path.join(home, ".config", "kraa");
  }
}

export const CONFIG_YAML = `hotkey: "CmdOrCtrl+Shift+Y"
provider:
  base_url: "${LLM_URL}/v1"
  api_key: ""
  model: "fake-a"
  timeout_seconds: 10
profile:
  enabled: false
  text: "Perfil padrão do E2E"
`;

export function configPath(): string {
  return path.join(configDir(process.env.KRAA_E2E_HOME!), "config.yaml");
}

export function writeConfig(): void {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), CONFIG_YAML, { mode: 0o600 });
}

/**
 * Creates the isolated HOME once (the config file is re-evaluated in every
 * worker; workers inherit KRAA_E2E_HOME from the runner process) and
 * returns the env for the kraa-e2e webServer.
 */
export function prepareHome(): Record<string, string> {
  if (!process.env.KRAA_E2E_HOME) {
    process.env.KRAA_E2E_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "kraa-e2e-"));
    writeConfig();
  }
  const home = process.env.KRAA_E2E_HOME;
  return {
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    APPDATA: path.join(home, "AppData", "Roaming"),
    WAILS_SERVER_HOST: "127.0.0.1",
    WAILS_SERVER_PORT: String(KRAA_PORT),
  };
}
