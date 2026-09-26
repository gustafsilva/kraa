import { describe, expect, it } from "vitest";
import {
  assetName,
  assetUrl,
  binaryPath,
  checksumsUrl,
  configDir,
  configPath,
  installDir,
  resolveRepo,
} from "../src/platform";

describe("assetName", () => {
  it.each([
    ["darwin", "x64", "prompt-improve-darwin-universal.app.zip"],
    ["darwin", "arm64", "prompt-improve-darwin-universal.app.zip"],
    ["win32", "x64", "prompt-improve-windows-amd64.exe"],
    ["linux", "x64", "prompt-improve-linux-amd64"],
    ["linux", "arm64", "prompt-improve-linux-arm64"],
  ] as const)("%s/%s -> %s", (platform, arch, expected) => {
    expect(assetName(platform, arch)).toBe(expected);
  });

  it.each([
    ["win32", "arm64"],
    ["win32", "ia32"],
    ["linux", "ia32"],
    ["linux", "arm"],
    ["darwin", "ia32"],
    ["freebsd", "x64"],
    ["aix", "ppc64"],
  ] as const)("rejeita %s/%s com mensagem PT-BR", (platform, arch) => {
    expect(() => assetName(platform as NodeJS.Platform, arch)).toThrow(
      /não é suportad/,
    );
  });
});

describe("installDir / binaryPath", () => {
  it("macOS usa ~/Applications/Prompt Improve.app", () => {
    expect(installDir("darwin", {}, "/Users/ana")).toBe(
      "/Users/ana/Applications/Prompt Improve.app",
    );
    expect(binaryPath("darwin", {}, "/Users/ana")).toBe(
      "/Users/ana/Applications/Prompt Improve.app/Contents/MacOS/prompt-improve",
    );
  });

  it("Windows usa %LOCALAPPDATA%\\prompt-improve", () => {
    const env = { LOCALAPPDATA: "C:\\Users\\Ana\\AppData\\Local" };
    expect(installDir("win32", env, "C:\\Users\\Ana")).toBe(
      "C:\\Users\\Ana\\AppData\\Local\\prompt-improve",
    );
    expect(binaryPath("win32", env, "C:\\Users\\Ana")).toBe(
      "C:\\Users\\Ana\\AppData\\Local\\prompt-improve\\prompt-improve.exe",
    );
  });

  it("Windows sem LOCALAPPDATA cai para ~\\AppData\\Local", () => {
    expect(installDir("win32", {}, "C:\\Users\\Ana")).toBe(
      "C:\\Users\\Ana\\AppData\\Local\\prompt-improve",
    );
  });

  it("Linux usa ~/.local/share/prompt-improve", () => {
    expect(installDir("linux", {}, "/home/ana")).toBe(
      "/home/ana/.local/share/prompt-improve",
    );
    expect(binaryPath("linux", {}, "/home/ana")).toBe(
      "/home/ana/.local/share/prompt-improve/prompt-improve",
    );
  });
});

describe("configDir / configPath (mesmas regras do os.UserConfigDir do Go)", () => {
  it("macOS: ~/Library/Application Support", () => {
    expect(configDir("darwin", {}, "/Users/ana")).toBe(
      "/Users/ana/Library/Application Support",
    );
    expect(configPath("darwin", {}, "/Users/ana")).toBe(
      "/Users/ana/Library/Application Support/prompt-improve/config.yaml",
    );
  });

  it("Linux: $XDG_CONFIG_HOME quando absoluto", () => {
    expect(configDir("linux", { XDG_CONFIG_HOME: "/xdg" }, "/home/ana")).toBe("/xdg");
  });

  it("Linux: ~/.config quando XDG_CONFIG_HOME está vazio", () => {
    expect(configDir("linux", { XDG_CONFIG_HOME: "" }, "/home/ana")).toBe(
      "/home/ana/.config",
    );
    expect(configPath("linux", {}, "/home/ana")).toBe(
      "/home/ana/.config/prompt-improve/config.yaml",
    );
  });

  it("Linux: XDG_CONFIG_HOME relativo é um erro, como no Go", () => {
    expect(() => configDir("linux", { XDG_CONFIG_HOME: "rel" }, "/home/ana")).toThrow(
      /XDG_CONFIG_HOME/,
    );
  });

  it("Windows: %AppData%", () => {
    expect(
      configPath("win32", { APPDATA: "C:\\Users\\Ana\\AppData\\Roaming" }, "C:\\Users\\Ana"),
    ).toBe("C:\\Users\\Ana\\AppData\\Roaming\\prompt-improve\\config.yaml");
  });

  it("Windows: %AppData% ausente é um erro, como no Go", () => {
    expect(() => configDir("win32", {}, "C:\\Users\\Ana")).toThrow(/AppData/);
  });
});

describe("repo e URLs", () => {
  it("usa o repository do package.json por padrão", () => {
    expect(resolveRepo({}, "github:gustafsilva/prompt-improve-beta")).toBe(
      "gustafsilva/prompt-improve-beta",
    );
    expect(
      resolveRepo({}, { type: "git", url: "git+https://github.com/o/r.git" }),
    ).toBe("o/r");
  });

  it("PROMPT_IMPROVE_REPO sobrescreve", () => {
    expect(
      resolveRepo({ PROMPT_IMPROVE_REPO: "fork/pi" }, "github:gustafsilva/prompt-improve-beta"),
    ).toBe("fork/pi");
  });

  it("monta as URLs de download do release", () => {
    expect(assetUrl("o/r", "1.2.3", "prompt-improve-linux-amd64")).toBe(
      "https://github.com/o/r/releases/download/v1.2.3/prompt-improve-linux-amd64",
    );
    expect(checksumsUrl("o/r", "1.2.3")).toBe(
      "https://github.com/o/r/releases/download/v1.2.3/checksums.txt",
    );
  });
});
