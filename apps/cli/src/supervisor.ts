import { spawn, type ChildProcess } from "node:child_process";
import type { EventEmitter } from "node:events";

/** Exit code a supervised server uses to ask for a fresh start from updated files. */
export const RESTART_EXIT_CODE = 75;
const SUPERVISED_ENV = "RUMI_SUPERVISED";

export function isSupervisedWorker(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[SUPERVISED_ENV] === "1";
}

export interface SuperviseWorkersOptions {
  command?: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
  signalSource?: EventEmitter;
  onExit?: (code: number) => void;
}

/**
 * Keeps the original `rumi serve` process alive as a small supervisor after an
 * in-app update, so the terminal, service manager, or container keeps one
 * stable process. The server runs as a child started from the files on disk;
 * a child exiting with RESTART_EXIT_CODE is started again after the next
 * update, and any other exit ends the supervisor with the same code. The
 * first INT or TERM signal is forwarded; a second one force-stops the child.
 */
export function superviseWorkers(options: SuperviseWorkersOptions = {}): void {
  const command = options.command ?? process.execPath;
  const args = options.args ?? [...process.execArgv, ...process.argv.slice(1)];
  const env = { ...(options.env ?? process.env), [SUPERVISED_ENV]: "1" };
  const signalSource = options.signalSource ?? process;
  const exit = options.onExit ?? ((code: number) => process.exit(code));
  let child: ChildProcess | null = null;
  let stopping = false;

  const start = () => {
    child = spawn(command, args, { stdio: "inherit", env });
    child.once("exit", (code, signal) => {
      if (code === RESTART_EXIT_CODE && !stopping) {
        start();
        return;
      }

      signalSource.off("SIGINT", forward);
      signalSource.off("SIGTERM", forward);
      exit(code ?? (signal === "SIGINT" || signal === "SIGTERM" ? 0 : 1));
    });
  };

  const forward = (signal: NodeJS.Signals) => {
    if (stopping) {
      child?.kill("SIGKILL");
      return;
    }

    stopping = true;
    child?.kill(signal);
  };

  signalSource.on("SIGINT", forward);
  signalSource.on("SIGTERM", forward);
  start();
}
