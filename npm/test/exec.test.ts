import { describe, expect, it, vi } from "vitest";
import { realExec, realSpawnDetached } from "../src/exec";

describe("realExec", () => {
  it("resolve com código 0", async () => {
    await expect(realExec(process.execPath, ["-e", "process.exit(0)"])).resolves.toBeUndefined();
  });

  it("rejeita com o código de saída", async () => {
    await expect(realExec(process.execPath, ["-e", "process.exit(3)"])).rejects.toThrow("código 3");
  });

  it("rejeita quando o comando não existe", async () => {
    await expect(realExec("kraa-comando-inexistente", [])).rejects.toThrow();
  });
});

describe("realSpawnDetached", () => {
  it("ENOENT vira mensagem no console, sem exceção não tratada", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    realSpawnDetached("kraa-comando-inexistente", []);
    await vi.waitFor(() => expect(err).toHaveBeenCalledWith(expect.stringContaining("Falha ao executar kraa-comando-inexistente")));
    err.mockRestore();
  });
});
