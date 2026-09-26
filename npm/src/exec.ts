// Únicos pontos que de fato criam processos. Tudo o mais recebe estas
// funções por injeção, para os testes nunca executarem nada de verdade.
import { spawn } from "node:child_process";

/** Executa e espera terminar; rejeita se o código de saída não for 0. */
export type Exec = (cmd: string, args: string[]) => Promise<void>;

/** Inicia destacado do terminal (stdio ignorado, sem esperar). */
export type SpawnDetached = (cmd: string, args: string[]) => void;

export const realExec: Exec = (cmd, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", windowsHide: true });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} terminou com ${signal ?? `código ${code}`}`));
    });
  });

export const realSpawnDetached: SpawnDetached = (cmd, args) => {
  const child = spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true });
  // Sem isto um ENOENT viraria exceção não tratada depois do unref.
  child.on("error", (err) => console.error(`Falha ao executar ${cmd}: ${err.message}`));
  child.unref();
};
