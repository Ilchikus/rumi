import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createTempWorkspace } from "@rumi/runtime";

const cleanupPaths: string[] = [];
const cliEntry = fileURLToPath(new URL("./index.ts", import.meta.url));
const tsxImport = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
const tsconfigPath = fileURLToPath(new URL("../../../tsconfig.json", import.meta.url));

afterEach(async () => {
  for (const cleanupPath of cleanupPaths.splice(0)) {
    await fs.rm(cleanupPath, { recursive: true, force: true });
  }
});

describe("Rumi auth CLI", () => {
  it("sets a password from stdin without printing or storing the plaintext", async () => {
    const workspacePath = await createTempWorkspace("rumi-cli-auth-");
    const stateDirectory = `${workspacePath}-state`;
    const statePath = path.join(stateDirectory, "auth.json");
    const password = "a CLI-only password that stays secret";
    cleanupPaths.push(workspacePath, stateDirectory);

    const result = await runCli(
      [
        "auth",
        "set-password",
        workspacePath,
        "--username",
        "owner",
        "--auth-state",
        statePath,
        "--password-stdin"
      ],
      `${password}\n`
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Password login configured for owner");
    expect(result.stdout).toContain("Existing sessions were invalidated.");
    expect(result.stdout).not.toContain(password);

    const storedState = await fs.readFile(statePath, "utf8");
    expect(storedState).toContain('"username": "owner"');
    expect(storedState).not.toContain(password);
    expect((await fs.stat(statePath)).mode & 0o777).toBe(0o600);
  });
});

describe("Rumi workspace CLI", () => {
  it("reports a missing required workspace argument", async () => {
    const result = await runCli(["status"], "");

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("missing required argument 'workspace'");
  });

  it("prints human-readable workspace status", async () => {
    const workspacePath = await createTempWorkspace("rumi-cli-status-");
    cleanupPaths.push(workspacePath);

    const result = await runCli(["status", workspacePath], "");

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(`Workspace: ${path.basename(workspacePath)}`);
    expect(result.stdout).toContain(`Root: ${workspacePath}`);
  });

  it("prints stable JSON status output", async () => {
    const workspacePath = await createTempWorkspace("rumi-cli-json-");
    cleanupPaths.push(workspacePath);

    const result = await runCli(["status", workspacePath, "--json"], "");

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      rootPath: workspacePath,
      name: path.basename(workspacePath)
    });
  });

  it("serves the current directory when no workspace argument is provided", async () => {
    const workspacePath = await createTempWorkspace("rumi-cli-serve-current-");
    cleanupPaths.push(workspacePath);
    await fs.writeFile(path.join(workspacePath, "Welcome.md"), "Hello from Rumi\n", "utf8");
    const serving = await startCliServer(workspacePath);

    try {
      const response = await fetch(new URL("/api/workspace", serving.url));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        rootPath: workspacePath,
        name: path.basename(workspacePath)
      });
    } finally {
      await serving.stop();
    }
  });
});

function runCli(
  arguments_: string[],
  stdin: string
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", tsxImport, cliEntry, ...arguments_],
      {
        cwd: process.cwd(),
        env: { ...process.env, TSX_TSCONFIG_PATH: tsconfigPath },
        stdio: ["pipe", "pipe", "pipe"]
      }
    );
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
    child.stdin.end(stdin);
  });
}

async function startCliServer(
  cwd: string
): Promise<{ url: string; stop: () => Promise<void> }> {
  const child = spawn(
    process.execPath,
    ["--import", tsxImport, cliEntry, "serve", "--api-only", "--port", "0"],
    {
      cwd,
      env: { ...process.env, TSX_TSCONFIG_PATH: tsconfigPath },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  let stdout = "";
  let stderr = "";

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const url = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Timed out waiting for CLI server.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 10_000);

    const inspectOutput = () => {
      const match = stdout.match(/Rumi server listening at (https?:\/\/\S+)/u);
      if (!match?.[1]) return;
      clearTimeout(timeout);
      resolve(match[1]);
    };

    child.stdout.on("data", inspectOutput);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (exitCode) => {
      clearTimeout(timeout);
      reject(new Error(`CLI server exited with ${exitCode}.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    });
  });

  return {
    url,
    stop: async () => {
      child.kill("SIGTERM");
      await once(child, "close");
    }
  };
}
