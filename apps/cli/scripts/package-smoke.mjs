import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execute = promisify(execFile);
const cliRoot = fileURLToPath(new URL("../", import.meta.url));
const packageJson = JSON.parse(
  await fs.readFile(path.join(cliRoot, "package.json"), "utf8")
);
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "rumi-cli-package-"));
const npmEnvironment = { ...process.env };
delete npmEnvironment.npm_config_dry_run;
delete npmEnvironment.NPM_CONFIG_DRY_RUN;
let servingProcess;

try {
  const packRoot = path.join(temporaryRoot, "pack");
  const installRoot = path.join(temporaryRoot, "install");
  const globalInstallRoot = path.join(temporaryRoot, "global-install");
  const workspaceRoot = path.join(temporaryRoot, "workspace");
  await fs.mkdir(packRoot, { recursive: true });
  await fs.mkdir(installRoot, { recursive: true });
  await fs.mkdir(globalInstallRoot, { recursive: true });
  await fs.mkdir(workspaceRoot, { recursive: true });
  await fs.writeFile(path.join(workspaceRoot, "Welcome.md"), "# Welcome to Rumi\n", "utf8");

  const packed = await execute(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["pack", "--json", "--ignore-scripts", "--pack-destination", packRoot],
    { cwd: cliRoot, env: npmEnvironment, maxBuffer: 20 * 1024 * 1024 }
  );
  const packResult = JSON.parse(packed.stdout)[0];
  if (!packResult?.filename || !Array.isArray(packResult.files)) {
    throw new Error(`npm pack returned an unexpected result: ${packed.stdout}`);
  }

  const packagedFiles = new Set(packResult.files.map((file) => file.path));
  for (const requiredPath of ["dist/index.js", "dist/web/index.html", "README.md", "package.json"]) {
    if (!packagedFiles.has(requiredPath)) {
      throw new Error(`The npm package is missing ${requiredPath}`);
    }
  }

  const tarballPath = path.join(packRoot, packResult.filename);
  const installed = await execute(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["install", "--prefix", installRoot, "--no-audit", "--no-fund", tarballPath],
    { cwd: temporaryRoot, env: npmEnvironment, maxBuffer: 20 * 1024 * 1024 }
  );
  if (/warn (?:allow-scripts|deprecated prebuild-install)/u.test(installed.stderr)) {
    throw new Error(`The package install emitted a native installer warning:\n${installed.stderr}`);
  }

  const installedLock = JSON.parse(
    await fs.readFile(path.join(installRoot, "package-lock.json"), "utf8")
  );
  const installScriptPackages = Object.entries(installedLock.packages ?? {})
    .filter(([, manifest]) => manifest?.hasInstallScript)
    .map(([packagePath]) => packagePath);
  if (installScriptPackages.length > 0) {
    throw new Error(
      `The package contains dependencies with install scripts: ${installScriptPackages.join(", ")}`
    );
  }

  const executable = path.join(
    installRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "rumi.cmd" : "rumi"
  );
  const version = await execute(executable, ["--version"], { cwd: workspaceRoot });
  if (version.stdout.trim() !== packageJson.version) {
    throw new Error(`Installed CLI reported ${version.stdout.trim()} instead of ${packageJson.version}`);
  }

  const localVersion = await execute(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["exec", "--", "rumi", "--version"],
    { cwd: installRoot, env: npmEnvironment, maxBuffer: 20 * 1024 * 1024 }
  );
  if (localVersion.stdout.trim() !== packageJson.version) {
    throw new Error(
      `Locally installed CLI reported ${localVersion.stdout.trim()} instead of ${packageJson.version}`
    );
  }

  const globalInstalled = await execute(
    process.platform === "win32" ? "npm.cmd" : "npm",
    [
      "install",
      "--global",
      "--prefix",
      globalInstallRoot,
      "--no-audit",
      "--no-fund",
      tarballPath
    ],
    { cwd: temporaryRoot, env: npmEnvironment, maxBuffer: 20 * 1024 * 1024 }
  );
  if (/warn (?:allow-scripts|deprecated prebuild-install)/u.test(globalInstalled.stderr)) {
    throw new Error(`The global package install emitted an installer warning:\n${globalInstalled.stderr}`);
  }
  const globalExecutable = process.platform === "win32"
    ? path.join(globalInstallRoot, "rumi.cmd")
    : path.join(globalInstallRoot, "bin", "rumi");
  const globalVersion = await execute(globalExecutable, ["--version"], { cwd: workspaceRoot });
  if (globalVersion.stdout.trim() !== packageJson.version) {
    throw new Error(
      `Globally installed CLI reported ${globalVersion.stdout.trim()} instead of ${packageJson.version}`
    );
  }

  const serving = await startServer(executable, workspaceRoot);
  servingProcess = serving.process;
  const workspaceResponse = await fetch(new URL("/api/workspace", serving.url));
  const workspace = await workspaceResponse.json();
  if (workspaceResponse.status !== 200 || workspace.rootPath !== workspaceRoot) {
    throw new Error(`Installed CLI served the wrong workspace: ${JSON.stringify(workspace)}`);
  }

  const applicationResponse = await fetch(new URL("/", serving.url));
  const applicationHtml = await applicationResponse.text();
  if (applicationResponse.status !== 200 || !applicationHtml.includes('<div id="root"></div>')) {
    throw new Error("Installed CLI did not serve the packaged official web client");
  }

  serving.process.kill("SIGTERM");
  await once(serving.process, "close");
  servingProcess = undefined;
  console.log(`Verified installable package ${packageJson.name}@${packageJson.version}`);
} finally {
  if (servingProcess && servingProcess.exitCode === null) {
    servingProcess.kill("SIGTERM");
    await once(servingProcess, "close").catch(() => undefined);
  }
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}

async function startServer(executable, cwd) {
  const child = spawn(executable, ["serve", "--port", "0"], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Timed out waiting for packaged CLI.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 15_000);

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
      reject(new Error(`Packaged CLI exited with ${exitCode}.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    });
  });

  return { process: child, url };
}
