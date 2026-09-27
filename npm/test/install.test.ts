import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { realExec } from "../src/exec";
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  DOWNLOAD_TIMEOUT_MS,
  defaultInstallDeps,
  install,
  parseChecksums,
  postinstall,
  runPostinstall,
  type InstallDeps,
} from "../src/install";

const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

let home: string;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "pi-install-test-"));
});
afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

/** fetch falso que serve um mapa nome-do-arquivo -> conteúdo. */
function fakeFetch(files: Record<string, Buffer | string>) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const name = url.split("/").pop()!;
    if (!(name in files)) return new Response("not found", { status: 404 });
    return new Response(files[name]);
  });
}

function deps(over: Partial<InstallDeps>): InstallDeps {
  return {
    platform: "linux",
    arch: "x64",
    env: {},
    home,
    version: "1.2.3",
    repo: "o/r",
    fetch: fakeFetch({}),
    exec: vi.fn(async () => {}),
    log: vi.fn(),
    ...over,
  };
}

function lsRecursive(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { recursive: true }).map(String);
}

describe("parseChecksums", () => {
  it("lê o formato do sha256sum (inclusive modo binário com *)", () => {
    const m = parseChecksums(`${"a".repeat(64)}  foo\n${"B".repeat(64)} *bar\n\n`);
    expect(m.get("foo")).toBe("a".repeat(64));
    expect(m.get("bar")).toBe("b".repeat(64));
  });
});

describe("install", () => {
  it("KRAA_SKIP_DOWNLOAD=1 pula o download", async () => {
    const d = deps({ env: { KRAA_SKIP_DOWNLOAD: "1" } });
    await expect(install(d)).resolves.toBe("skipped");
    expect(d.fetch).not.toHaveBeenCalled();
    expect(fs.readdirSync(home)).toEqual([]);
  });

  it("Linux: baixa, confere o SHA-256, instala e faz chmod +x", async () => {
    const bin = Buffer.from("#!/bin/sh\necho oi\n");
    const asset = "kraa-linux-amd64";
    const fetch = fakeFetch({ [asset]: bin, "checksums.txt": `${sha(bin)}  ${asset}\n` });
    await expect(install(deps({ fetch }))).resolves.toBe("installed");

    expect(fetch).toHaveBeenCalledWith(
      `https://github.com/o/r/releases/download/v1.2.3/${asset}`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    const target = path.join(home, ".local/share/kraa/kraa");
    expect(fs.readFileSync(target)).toEqual(bin);
    if (process.platform !== "win32") {
      expect(fs.statSync(target).mode & 0o111).toBe(0o111);
    }
    expect(lsRecursive(path.join(home, ".local/share/kraa"))).toEqual([
      "kraa",
    ]);
  });

  it.each(["0", "false"])("KRAA_SKIP_DOWNLOAD=%s não pula o download", async (v) => {
    const bin = Buffer.from("#!/bin/sh\necho oi\n");
    const asset = "kraa-linux-amd64";
    const fetch = fakeFetch({ [asset]: bin, "checksums.txt": `${sha(bin)}  ${asset}\n` });
    await expect(install(deps({ fetch, env: { KRAA_SKIP_DOWNLOAD: v } }))).resolves.toBe("installed");
    expect(fetch).toHaveBeenCalled();
    const target = path.join(home, ".local/share/kraa/kraa");
    expect(fs.readFileSync(target)).toEqual(bin);
  });

  it("Windows: baixa e instala o .exe (sem checar bits de permissão Unix)", async () => {
    // installDir/binaryPath usam path.win32 (separador "\"), que não é um
    // caminho utilizável pelo fs real de um host POSIX rodando os testes;
    // as chamadas de fs são espionadas para não tocar o disco de verdade,
    // exceto o renameSync final, que já é injetável via `d.fs`. O código
    // (install.ts:146-149) chama fs.chmodSync também no Windows (ramo
    // genérico "não-darwin"); ao contrário do teste Linux, não faz sentido
    // conferir bits de permissão Unix aqui, então só espiamos a chamada.
    const bin = Buffer.from("MZ...fake exe");
    const asset = "kraa-windows-amd64.exe";
    const fetch = fakeFetch({ [asset]: bin, "checksums.txt": `${sha(bin)}  ${asset}\n` });
    const mkdirSync = vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);
    const mkdtempSync = vi
      .spyOn(fs, "mkdtempSync")
      .mockImplementation((prefix) => `${prefix}XXXXXX`);
    const writeFileSync = vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);
    const readFileSync = vi.spyOn(fs, "readFileSync").mockReturnValue(bin);
    const rmSync = vi.spyOn(fs, "rmSync").mockImplementation(() => undefined);
    const chmodSync = vi.spyOn(fs, "chmodSync").mockImplementation(() => undefined);
    const renameSync = vi.fn();
    try {
      const env = { LOCALAPPDATA: "C:\\Users\\Ana\\AppData\\Local" };
      await expect(
        install(deps({ platform: "win32", fetch, env, fs: { renameSync } })),
      ).resolves.toBe("installed");
      expect(writeFileSync).toHaveBeenCalledWith(expect.any(String), bin);
      expect(chmodSync).toHaveBeenCalledWith(expect.any(String), 0o755);
      expect(renameSync).toHaveBeenCalledOnce();
      expect(renameSync.mock.calls[0][1]).toBe("C:\\Users\\Ana\\AppData\\Local\\kraa\\kraa.exe");
    } finally {
      mkdirSync.mockRestore();
      mkdtempSync.mockRestore();
      writeFileSync.mockRestore();
      readFileSync.mockRestore();
      rmSync.mockRestore();
      chmodSync.mockRestore();
    }
  });

  it.each(["EPERM", "EBUSY"])(
    "binário em uso (%s no rename, ex.: .exe rodando no Windows) vira mensagem PT-BR e não deixa temporários",
    async (code) => {
      const bin = Buffer.from("bin");
      const asset = "kraa-linux-amd64";
      const fetch = fakeFetch({ [asset]: bin, "checksums.txt": `${sha(bin)}  ${asset}\n` });
      const renameSync = vi.fn(() => {
        throw Object.assign(new Error(`${code}: operation not permitted, rename`), { code });
      });
      await expect(install(deps({ fetch, fs: { renameSync } }))).rejects.toThrow(
        "Feche o Kraa (kraa stop) e rode kraa install novamente",
      );
      expect(renameSync).toHaveBeenCalledTimes(1);
      expect(lsRecursive(path.join(home, ".local/share/kraa"))).toEqual([]);
    },
  );

  it("outros erros do rename continuam propagando como estão", async () => {
    const bin = Buffer.from("bin");
    const asset = "kraa-linux-amd64";
    const fetch = fakeFetch({ [asset]: bin, "checksums.txt": `${sha(bin)}  ${asset}\n` });
    const renameSync = vi.fn(() => {
      throw Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" });
    });
    await expect(install(deps({ fetch, fs: { renameSync } }))).rejects.toThrow("ENOSPC");
  });

  it("checksum inválido aborta e remove o arquivo parcial", async () => {
    const asset = "kraa-linux-amd64";
    const fetch = fakeFetch({
      [asset]: "conteudo adulterado",
      "checksums.txt": `${sha("original")}  ${asset}\n`,
    });
    await expect(install(deps({ fetch }))).rejects.toThrow(/SHA-256/);
    const dir = path.join(home, ".local/share/kraa");
    expect(lsRecursive(dir)).toEqual([]);
  });

  it("asset ausente do checksums.txt aborta", async () => {
    const asset = "kraa-linux-amd64";
    const fetch = fakeFetch({ [asset]: "x", "checksums.txt": `${sha("x")}  outro\n` });
    await expect(install(deps({ fetch }))).rejects.toThrow(/checksums\.txt/);
    expect(lsRecursive(path.join(home, ".local/share/kraa"))).toEqual([]);
  });

  it("HTTP 404 vira erro com a URL", async () => {
    await expect(install(deps({}))).rejects.toThrow(/404.*checksums\.txt|checksums\.txt.*404/);
  });

  it("timeout padrão do download é uma constante nomeada de 120s", () => {
    expect(DOWNLOAD_TIMEOUT_MS).toBe(120_000);
  });

  it("download travado estoura o timeout com mensagem PT-BR e não deixa arquivo parcial", async () => {
    const asset = "kraa-linux-amd64";
    // Servidor real: o checksums.txt responde, o asset manda um pedaço e trava.
    const server = http.createServer((req, res) => {
      if (req.url?.endsWith("checksums.txt")) {
        res.end(`${sha("x")}  ${asset}\n`);
        return;
      }
      res.writeHead(200, { "content-length": "1000000" });
      res.write("pedaço parcial");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const port = (server.address() as AddressInfo).port;
    try {
      const d = deps({
        downloadTimeoutMs: 200,
        fetch: (url, init) =>
          fetch(`http://127.0.0.1:${port}/${String(url).split("/").pop()}`, init),
      });
      await expect(install(d)).rejects.toThrow(/Tempo esgotado.*0\.2s.*kraa-linux-amd64/);
      expect(lsRecursive(path.join(home, ".local/share/kraa"))).toEqual([]);
    } finally {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
  });

  it("plataforma não suportada falha antes de baixar", async () => {
    const d = deps({ platform: "freebsd" });
    await expect(install(d)).rejects.toThrow(/não é suportad/);
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it("macOS: extrai o zip com ditto e move o .app para ~/Applications", async () => {
    const zip = Buffer.from("zip falso");
    const asset = "kraa-darwin-universal.app.zip";
    const fetch = fakeFetch({ [asset]: zip, "checksums.txt": `${sha(zip)}  ${asset}\n` });
    // ditto simulado: cria o bundle no diretório de destino.
    const exec = vi.fn(async (cmd: string, args: string[]) => {
      expect(cmd).toBe("ditto");
      expect(args.slice(0, 2)).toEqual(["-x", "-k"]);
      const out = args[3];
      fs.mkdirSync(path.join(out, "Kraa.app/Contents/MacOS"), { recursive: true });
      fs.writeFileSync(path.join(out, "Kraa.app/Contents/MacOS/kraa"), "bin");
    });
    await install(deps({ platform: "darwin", arch: "arm64", fetch, exec }));
    expect(exec).toHaveBeenCalledOnce();
    const app = path.join(home, "Applications/Kraa.app");
    expect(fs.readFileSync(path.join(app, "Contents/MacOS/kraa"), "utf8")).toBe("bin");
    expect(fs.readdirSync(path.join(home, "Applications"))).toEqual(["Kraa.app"]);
  });

  it.skipIf(process.platform !== "darwin")(
    "macOS (real): ditto de verdade extrai um zip criado com --keepParent",
    async () => {
      const src = fs.mkdtempSync(path.join(os.tmpdir(), "pi-zip-src-"));
      try {
        const app = path.join(src, "Kraa.app/Contents/MacOS");
        fs.mkdirSync(app, { recursive: true });
        fs.writeFileSync(path.join(app, "kraa"), "bin", { mode: 0o755 });
        const zipPath = path.join(src, "a.zip");
        execFileSync("ditto", ["-c", "-k", "--keepParent", path.join(src, "Kraa.app"), zipPath]);
        const zip = fs.readFileSync(zipPath);
        const asset = "kraa-darwin-universal.app.zip";
        const fetch = fakeFetch({ [asset]: zip, "checksums.txt": `${sha(zip)}  ${asset}\n` });
        await install(deps({ platform: "darwin", arch: "arm64", fetch, exec: realExec }));
        const bin = path.join(home, "Applications/Kraa.app/Contents/MacOS/kraa");
        expect(fs.statSync(bin).mode & 0o111).toBe(0o111);
      } finally {
        fs.rmSync(src, { recursive: true, force: true });
      }
    },
  );
});

describe("postinstall", () => {
  it("falha de download sai com 0 e avisa para rodar `kraa install`", async () => {
    const log = vi.fn();
    const fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(postinstall(deps({ fetch, log }))).resolves.toBe(0);
    const out = log.mock.calls.map((c) => c[0]).join("\n");
    expect(out).toMatch(/kraa install/);
    expect(out).toMatch(/Não foi possível/);
  });

  it("erro síncrono ao montar as dependências também sai com 0 e avisa", async () => {
    const log = vi.fn();
    const code = await runPostinstall(() => {
      throw new Error("package.json ilegível");
    }, log);
    expect(code).toBe(0);
    const out = log.mock.calls.map((c) => c[0]).join("\n");
    expect(out).toMatch(/Não foi possível/);
    expect(out).toMatch(/package\.json ilegível/);
    expect(out).toMatch(/kraa install/);
  });

  it("SKIP_DOWNLOAD sai com 0 sem baixar", async () => {
    const d = deps({ env: { KRAA_SKIP_DOWNLOAD: "1" } });
    await expect(postinstall(d)).resolves.toBe(0);
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it("erro síncrono sem `log` explícito usa o padrão (console.log)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const code = await runPostinstall(() => {
        throw new Error("package.json ilegível");
      });
      expect(code).toBe(0);
      const out = logSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(out).toMatch(/Não foi possível/);
    } finally {
      logSpy.mockRestore();
    }
  });
});

describe("defaultInstallDeps", () => {
  it("monta as dependências reais (version/repo/log/fetch)", async () => {
    const d = defaultInstallDeps();
    expect(typeof d.version).toBe("string");
    expect(typeof d.repo).toBe("string");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    d.log("teste");
    expect(logSpy).toHaveBeenCalledWith("teste");
    logSpy.mockRestore();

    // Porta local fechada: erro imediato (ECONNREFUSED), sem download real.
    const closed = http.createServer();
    const port = await new Promise<number>((r) =>
      closed.listen(0, "127.0.0.1", () => r((closed.address() as AddressInfo).port)),
    );
    await new Promise((r) => closed.close(r));
    await expect(d.fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow();
  });
});
