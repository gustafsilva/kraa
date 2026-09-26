import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run, type CliDeps } from "../src/cli";

let home: string;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "pi-cli-test-"));
});
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

function deps(over: Partial<CliDeps> = {}) {
  const lines: string[] = [];
  const d: CliDeps = {
    platform: "linux",
    arch: "x64",
    env: {},
    home,
    version: "1.2.3",
    repo: "o/r",
    fetch: vi.fn(async () => new Response("nada", { status: 404 })),
    exec: vi.fn(async () => {}),
    spawnDetached: vi.fn(),
    commandExists: vi.fn(async () => true),
    log: (m: string) => lines.push(m),
    ...over,
  };
  return { d, out: () => lines.join("\n") };
}

function fakeInstalled(platform: NodeJS.Platform): string {
  const bin =
    platform === "darwin"
      ? path.join(home, "Applications/Prompt Improve.app/Contents/MacOS/prompt-improve")
      : path.join(home, ".local/share/prompt-improve/prompt-improve");
  fs.mkdirSync(path.dirname(bin), { recursive: true });
  fs.writeFileSync(bin, "");
  return bin;
}

describe("cli", () => {
  it("help lista os subcomandos", async () => {
    const { d, out } = deps();
    await expect(run(["help"], d)).resolves.toBe(0);
    for (const c of ["start", "stop", "trigger", "config", "autostart on|off", "doctor", "install"]) {
      expect(out()).toContain(c);
    }
    await expect(run([], d)).resolves.toBe(0);
  });

  it("subcomando desconhecido sai com 2", async () => {
    const { d, out } = deps();
    await expect(run(["xyz"], d)).resolves.toBe(2);
    expect(out()).toMatch(/desconhecido/);
  });

  it("start (Linux) inicia o binário destacado", async () => {
    const bin = fakeInstalled("linux");
    const { d } = deps();
    await expect(run(["start"], d)).resolves.toBe(0);
    expect(d.spawnDetached).toHaveBeenCalledWith(bin, []);
  });

  it("start (macOS) usa open -a", async () => {
    fakeInstalled("darwin");
    const { d } = deps({ platform: "darwin", arch: "arm64" });
    await expect(run(["start"], d)).resolves.toBe(0);
    expect(d.spawnDetached).toHaveBeenCalledWith("open", [
      "-a",
      path.join(home, "Applications/Prompt Improve.app"),
    ]);
  });

  it("start sem binário tenta instalar e falha com mensagem", async () => {
    const { d, out } = deps();
    await expect(run(["start"], d)).resolves.toBe(1);
    expect(d.fetch).toHaveBeenCalled();
    expect(d.spawnDetached).not.toHaveBeenCalled();
    expect(out()).toMatch(/404/);
  });

  it.each([
    ["darwin", "osascript", ["-e", 'quit app "Prompt Improve"']],
    ["win32", "taskkill", ["/IM", "prompt-improve.exe", "/F"]],
    ["linux", "pkill", ["-x", "prompt-improve"]],
  ] as const)("stop (%s)", async (platform, cmd, args) => {
    const { d } = deps({ platform, env: { LOCALAPPDATA: "C:\\L", APPDATA: "C:\\R" } });
    await expect(run(["stop"], d)).resolves.toBe(0);
    expect(d.exec).toHaveBeenCalledWith(cmd, args);
  });

  it("stop quando não está rodando sai com 1", async () => {
    const { d, out } = deps({ exec: vi.fn(async () => Promise.reject(new Error("código 1"))) });
    await expect(run(["stop"], d)).resolves.toBe(1);
    expect(out()).toMatch(/não parece estar em execução/);
  });

  it("trigger (Linux) repassa --trigger; aceita também `--trigger`", async () => {
    const bin = fakeInstalled("linux");
    const { d } = deps();
    await expect(run(["trigger"], d)).resolves.toBe(0);
    await expect(run(["--trigger"], d)).resolves.toBe(0);
    expect(d.spawnDetached).toHaveBeenCalledTimes(2);
    expect(d.spawnDetached).toHaveBeenCalledWith(bin, ["--trigger"]);
  });

  it("trigger (macOS) usa open -n -a … --args --trigger", async () => {
    fakeInstalled("darwin");
    const { d } = deps({ platform: "darwin" });
    await expect(run(["trigger"], d)).resolves.toBe(0);
    expect(d.spawnDetached).toHaveBeenCalledWith("open", [
      "-n",
      "-a",
      path.join(home, "Applications/Prompt Improve.app"),
      "--args",
      "--trigger",
    ]);
  });

  it("config abre o YAML existente e mostra o caminho", async () => {
    const cfg = path.join(home, ".config/prompt-improve/config.yaml");
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    fs.writeFileSync(cfg, "provider: {}\n");
    const { d, out } = deps();
    await expect(run(["config"], d)).resolves.toBe(0);
    expect(d.spawnDetached).toHaveBeenCalledWith("xdg-open", [cfg]);
    expect(out()).toContain(cfg);
  });

  it("config sem arquivo avisa que o app cria na primeira execução", async () => {
    const { d, out } = deps();
    await expect(run(["config"], d)).resolves.toBe(1);
    expect(out()).toMatch(/primeira execução/);
    expect(d.spawnDetached).not.toHaveBeenCalled();
  });

  it("autostart on/off (Linux) escreve e remove o .desktop no HOME temporário", async () => {
    const file = path.join(home, ".config/autostart/prompt-improve.desktop");
    const { d } = deps();
    await expect(run(["autostart", "on"], d)).resolves.toBe(0);
    expect(fs.existsSync(file)).toBe(true);
    await expect(run(["autostart", "off"], d)).resolves.toBe(0);
    expect(fs.existsSync(file)).toBe(false);
  });

  it("autostart sem on|off sai com 2", async () => {
    const { d, out } = deps();
    await expect(run(["autostart"], d)).resolves.toBe(2);
    expect(out()).toMatch(/on\|off/);
  });

  it("install com PROMPT_IMPROVE_SKIP_DOWNLOAD=1 pula", async () => {
    const { d, out } = deps({ env: { PROMPT_IMPROVE_SKIP_DOWNLOAD: "1" } });
    await expect(run(["install"], d)).resolves.toBe(0);
    expect(d.fetch).not.toHaveBeenCalled();
    expect(out()).toMatch(/ignorado/);
  });

  it("install com erro sai com 1 (diferente do postinstall)", async () => {
    const { d, out } = deps();
    await expect(run(["install"], d)).resolves.toBe(1);
    expect(out()).toMatch(/\[erro\]/);
  });

  it("doctor retorna 1 quando algo falha", async () => {
    const { d, out } = deps({ fetch: vi.fn(async () => Promise.reject(new TypeError("fetch failed"))) });
    await expect(run(["doctor"], d)).resolves.toBe(1);
    expect(out()).toContain("ollama serve");
  });
});
