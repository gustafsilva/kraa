import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REG_RUN_KEY,
  autostartPath,
  desktopEntry,
  launchAgentPlist,
  regAddArgs,
  regDeleteArgs,
  setAutostart,
} from "../src/autostart";

describe("conteúdo gerado", () => {
  it("plist do LaunchAgent abre o .app no login", () => {
    const xml = launchAgentPlist("/Users/ana/Applications/Prompt Improve.app");
    expect(xml).toContain("<key>Label</key>\n  <string>dev.matrixia.prompt-improve</string>");
    expect(xml).toContain(
      "<key>ProgramArguments</key>\n  <array>\n    <string>/usr/bin/open</string>\n" +
        "    <string>-a</string>\n    <string>/Users/ana/Applications/Prompt Improve.app</string>\n  </array>",
    );
    expect(xml).toContain("<key>RunAtLoad</key>\n  <true/>");
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  it("plist escapa caracteres XML", () => {
    expect(launchAgentPlist("/Users/a&b/<x>.app")).toContain("/Users/a&amp;b/&lt;x&gt;.app");
  });

  it(".desktop do autostart do XDG", () => {
    const txt = desktopEntry("/home/ana/.local/share/prompt-improve/prompt-improve");
    expect(txt).toBe(
      [
        "[Desktop Entry]",
        "Type=Application",
        "Name=Prompt Improve",
        "Comment=Melhora o texto selecionado via LLM",
        'Exec="/home/ana/.local/share/prompt-improve/prompt-improve"',
        "Terminal=false",
        "X-GNOME-Autostart-enabled=true",
        "",
      ].join("\n"),
    );
  });

  it(".desktop escapa aspas, $ e \\ no Exec", () => {
    expect(desktopEntry('/home/a"b/$x\\y')).toContain('Exec="/home/a\\"b/\\$x\\\\y"');
  });

  it("argumentos do reg add/delete", () => {
    expect(REG_RUN_KEY).toBe("HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run");
    expect(regAddArgs("C:\\Users\\Ana\\AppData\\Local\\prompt-improve\\prompt-improve.exe")).toEqual([
      "add",
      "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
      "/v",
      "PromptImprove",
      "/t",
      "REG_SZ",
      "/d",
      '"C:\\Users\\Ana\\AppData\\Local\\prompt-improve\\prompt-improve.exe"',
      "/f",
    ]);
    expect(regDeleteArgs()).toEqual([
      "delete",
      "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
      "/v",
      "PromptImprove",
      "/f",
    ]);
  });

  it("caminhos dos arquivos de autostart", () => {
    expect(autostartPath("darwin", {}, "/Users/ana")).toBe(
      "/Users/ana/Library/LaunchAgents/dev.matrixia.prompt-improve.plist",
    );
    expect(autostartPath("linux", {}, "/home/ana")).toBe(
      "/home/ana/.config/autostart/prompt-improve.desktop",
    );
    expect(autostartPath("linux", { XDG_CONFIG_HOME: "/xdg" }, "/home/ana")).toBe(
      "/xdg/autostart/prompt-improve.desktop",
    );
  });
});

describe("setAutostart (em HOME temporário, exec injetado)", () => {
  let home: string;
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "pi-autostart-test-"));
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it("macOS: cria e remove o plist", async () => {
    const exec = vi.fn(async () => {});
    const d = { platform: "darwin" as const, env: {}, home, exec };
    const file = path.join(home, "Library/LaunchAgents/dev.matrixia.prompt-improve.plist");
    await setAutostart(true, d);
    expect(fs.readFileSync(file, "utf8")).toContain("Prompt Improve.app");
    await setAutostart(false, d);
    expect(fs.existsSync(file)).toBe(false);
    await expect(setAutostart(false, d)).resolves.toBeUndefined(); // idempotente
    expect(exec).not.toHaveBeenCalled();
  });

  it("Linux: cria e remove o .desktop", async () => {
    const d = { platform: "linux" as const, env: {}, home, exec: vi.fn(async () => {}) };
    const file = path.join(home, ".config/autostart/prompt-improve.desktop");
    await setAutostart(true, d);
    expect(fs.readFileSync(file, "utf8")).toContain(
      `Exec="${home}/.local/share/prompt-improve/prompt-improve"`,
    );
    await setAutostart(false, d);
    expect(fs.existsSync(file)).toBe(false);
  });

  it("Windows: chama reg add / reg delete", async () => {
    const exec = vi.fn(async () => {});
    const env = { LOCALAPPDATA: "C:\\L" };
    const d = { platform: "win32" as const, env, home: "C:\\Users\\Ana", exec };
    await setAutostart(true, d);
    expect(exec).toHaveBeenLastCalledWith("reg", regAddArgs("C:\\L\\prompt-improve\\prompt-improve.exe"));
    await setAutostart(false, d);
    expect(exec).toHaveBeenLastCalledWith("reg", regDeleteArgs());
  });
});
