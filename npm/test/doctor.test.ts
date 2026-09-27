import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BASE_URL, doctor, readBaseUrl, realCommandExists, type DoctorDeps } from "../src/doctor";

describe("readBaseUrl", () => {
  it.each([
    ['provider:\n  base_url: "http://h:1/v1"\n  model: x\n', "http://h:1/v1"],
    ["provider:\n  base_url: 'http://h:2/v1' # comentário\n", "http://h:2/v1"],
    ["provider:\n  base_url: http://h:3/v1\n", "http://h:3/v1"],
    ["provider:\r\n  base_url: http://h:4/v1\r\n", "http://h:4/v1"],
    ["provider:\n  model: x\n", undefined],
    ["# base_url: http://comentado\n", undefined],
  ])("%j -> %s", (yaml, expected) => {
    expect(readBaseUrl(yaml)).toBe(expected);
  });
});

let home: string;
let servers: http.Server[] = [];
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "pi-doctor-test-"));
});
afterEach(async () => {
  fs.rmSync(home, { recursive: true, force: true });
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  servers = [];
});

function listen(handler: http.RequestListener): Promise<number> {
  const s = http.createServer(handler);
  servers.push(s);
  return new Promise((resolve) => s.listen(0, "127.0.0.1", () => resolve((s.address() as AddressInfo).port)));
}

/** Uma porta local que certamente está fechada. */
async function closedPort(): Promise<number> {
  const s = http.createServer();
  const port = await new Promise<number>((r) => s.listen(0, "127.0.0.1", () => r((s.address() as AddressInfo).port)));
  await new Promise((r) => s.close(r));
  return port;
}

function writeConfig(platform: NodeJS.Platform, baseUrl: string) {
  const dir =
    platform === "darwin"
      ? path.join(home, "Library/Application Support/kraa")
      : path.join(home, ".config/kraa");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.yaml"), `provider:\n  base_url: "${baseUrl}"\n`);
}

function deps(over: Partial<DoctorDeps>) {
  const lines: string[] = [];
  const d: DoctorDeps = {
    platform: "linux",
    env: { XDG_SESSION_TYPE: "x11" },
    home,
    fetch: (url, init) => fetch(url, init),
    commandExists: vi.fn(async () => true),
    log: (m) => lines.push(m),
    ...over,
  };
  return { d, out: () => lines.join("\n") };
}

describe("doctor", () => {
  it("Ollama fora do ar: dá a dica `ollama serve`", async () => {
    const port = await closedPort();
    writeConfig("linux", `http://127.0.0.1:${port}/v1`);
    const { d, out } = deps({});
    await expect(doctor(d)).resolves.toBe(false);
    expect(out()).toContain(`http://127.0.0.1:${port}/v1/models`);
    expect(out()).toContain("ollama serve");
  });

  it("Ollama no ar: responde OK em /models", async () => {
    let seen = "";
    const port = await listen((req, res) => {
      seen = req.url ?? "";
      res.end('{"data":[]}');
    });
    writeConfig("linux", `http://127.0.0.1:${port}/v1/`);
    const { d, out } = deps({});
    await doctor(d);
    expect(seen).toBe("/v1/models");
    expect(out()).not.toContain("ollama serve");
    expect(out()).toMatch(/\[ok\].*127\.0\.0\.1/);
  });

  it("sem config.yaml usa o base_url padrão", async () => {
    const urls: string[] = [];
    const { d, out } = deps({
      fetch: async (url) => {
        urls.push(url);
        return new Response("{}");
      },
    });
    await doctor(d);
    expect(urls).toEqual([`${DEFAULT_BASE_URL}/models`]);
    expect(out()).toMatch(/padrão/);
  });

  it("binário ausente sugere `kraa install`", async () => {
    const { d, out } = deps({ fetch: async () => new Response("{}") });
    await expect(doctor(d)).resolves.toBe(false);
    expect(out()).toMatch(/\[erro\].*não encontrado/);
    expect(out()).toContain("kraa install");
  });

  it("binário presente é reportado como ok", async () => {
    const bin = path.join(home, ".local/share/kraa/kraa");
    fs.mkdirSync(path.dirname(bin), { recursive: true });
    fs.writeFileSync(bin, "");
    const { d, out } = deps({ fetch: async () => new Response("{}") });
    await expect(doctor(d)).resolves.toBe(true);
    expect(out()).toContain(`[ok] Binário instalado: ${bin}`);
  });

  it("Linux: avisa sem xdotool e em sessão Wayland", async () => {
    const { d, out } = deps({
      env: { XDG_SESSION_TYPE: "wayland" },
      commandExists: vi.fn(async () => false),
      fetch: async () => new Response("{}"),
    });
    await doctor(d);
    expect(d.commandExists).toHaveBeenCalledWith("xdotool");
    expect(out()).toMatch(/xdotool.*não encontrado/);
    expect(out()).toMatch(/Wayland/);
  });

  it("macOS: explica que a Acessibilidade é verificada pelo próprio app", async () => {
    const { d, out } = deps({ platform: "darwin", fetch: async () => new Response("{}") });
    await doctor(d);
    expect(out()).toMatch(/Acessibilidade/);
    expect(d.commandExists).not.toHaveBeenCalled();
  });
});

describe("realCommandExists", () => {
  it("acha executável no PATH e ignora entradas vazias", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kraa-path-"));
    const name = process.platform === "win32" ? "ferramenta.EXE" : "ferramenta";
    fs.writeFileSync(path.join(dir, name), "", { mode: 0o755 });
    const env = { PATH: ["", dir].join(path.delimiter), PATHEXT: ".EXE" };
    await expect(realCommandExists("ferramenta", env)).resolves.toBe(true);
    await expect(realCommandExists("inexistente", env)).resolves.toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("PATH ausente → false", async () => {
    await expect(realCommandExists("qualquer", {})).resolves.toBe(false);
  });
});
