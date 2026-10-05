import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTempWorkspace } from "@rumi/runtime";
import { RESTART_EXIT_CODE, superviseWorkers } from "./supervisor";

const cleanupPaths: string[] = [];

afterEach(async () => {
  for (const cleanupPath of cleanupPaths.splice(0)) {
    await fs.rm(cleanupPath, { recursive: true, force: true });
  }
});

async function workerScript(source: string): Promise<{ script: string; directory: string }> {
  const directory = await createTempWorkspace("rumi-supervisor-");
  cleanupPaths.push(directory);
  const script = path.join(directory, "worker.mjs");
  await fs.writeFile(script, source, "utf8");
  return { script, directory };
}

function supervise(script: string, signalSource = new EventEmitter()) {
  return new Promise<number>((resolve) => {
    superviseWorkers({
      command: process.execPath,
      args: [script],
      signalSource,
      onExit: resolve
    });
  });
}

describe("rumi serve supervisor", () => {
  it("starts a fresh worker after a restart exit and ends with the final worker's code", async () => {
    const { script, directory } = await workerScript(`
      import fs from "node:fs";
      const log = new URL("./starts.log", import.meta.url);
      fs.appendFileSync(log, process.env.RUMI_SUPERVISED + "\\n");
      const count = fs.readFileSync(log, "utf8").trim().split("\\n").length;
      process.exit(count < 3 ? ${RESTART_EXIT_CODE} : 4);
    `);

    const code = await supervise(script);

    expect(code).toBe(4);
    expect(await fs.readFile(path.join(directory, "starts.log"), "utf8")).toBe("1\n1\n1\n");
  });

  it("forwards the first stop signal and force-stops on the second", async () => {
    const { script: graceful } = await workerScript(`
      process.on("SIGTERM", () => process.exit(0));
      setInterval(() => {}, 1000);
    `);
    const stopSignals = new EventEmitter();
    const stopped = supervise(graceful, stopSignals);
    await new Promise((resolve) => setTimeout(resolve, 300));
    stopSignals.emit("SIGTERM", "SIGTERM");
    expect(await stopped).toBe(0);

    const { script: stubborn } = await workerScript(`
      process.on("SIGINT", () => {});
      setInterval(() => {}, 1000);
    `);
    const forceSignals = new EventEmitter();
    const forced = supervise(stubborn, forceSignals);
    await new Promise((resolve) => setTimeout(resolve, 300));
    forceSignals.emit("SIGINT", "SIGINT");
    forceSignals.emit("SIGINT", "SIGINT");
    expect(await forced).toBe(1);
  });
});
