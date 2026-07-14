import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTempWorkspace } from "@rumi/runtime";

const cleanupPaths: string[] = [];

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

function runCli(
  arguments_: string[],
  stdin: string
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "apps/cli/src/index.ts", ...arguments_],
      {
        cwd: process.cwd(),
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
