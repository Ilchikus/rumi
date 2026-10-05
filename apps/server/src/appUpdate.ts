import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { AppInfoResult } from "@rumi/contracts";

export const RUMI_PACKAGE_NAME = "@rumi-md/server";
const REGISTRY_LATEST_URL = "https://registry.npmjs.org/@rumi-md/server/latest";
const LATEST_VERSION_TTL_MS = 6 * 60 * 60 * 1_000;
const FAILED_CHECK_TTL_MS = 30 * 60 * 1_000;
const REGISTRY_TIMEOUT_MS = 5_000;
const NPM_TIMEOUT_MS = 5 * 60 * 1_000;
const GLOBAL_INSTALL_COMMAND = `npm install --global ${RUMI_PACKAGE_NAME}@latest`;
const NPX_COMMAND = `npx ${RUMI_PACKAGE_NAME}@latest serve`;

export interface RumiAppOptions {
  /** Version of the running `@rumi-md/server` package. */
  version: string;
  /** False disables registry requests and in-app updates (`--no-update-check`). */
  updateCheck?: boolean;
  /** Script that started this process; defaults to `process.argv[1]`. */
  entryPath?: string;
  /** Hands the process over to the newly installed version after the update reply is sent. */
  restart?: () => void;
  fetchLatestVersion?: () => Promise<string | null>;
  globalPackageRoot?: () => Promise<string | null>;
  installVersion?: (version: string) => Promise<void>;
}

export class AppUpdateError extends Error {
  readonly code: "update_unavailable" | "update_failed";
  readonly command: string;

  constructor(code: AppUpdateError["code"], message: string, command = GLOBAL_INSTALL_COMMAND) {
    super(message);
    this.code = code;
    this.command = command;
  }
}

export class AppUpdater {
  private latest: { version: string | null; checkedAt: number } | null = null;
  private latestRequest: Promise<string | null> | null = null;
  private installKind: Promise<"global" | "npx" | "other"> | null = null;
  private updateInFlight: Promise<string> | null = null;

  constructor(private readonly options: RumiAppOptions | undefined) {}

  get enabled(): boolean {
    return Boolean(this.options) && this.options?.updateCheck !== false;
  }

  /** Starts the first registry check in the background so Settings opens instantly. */
  prefetch(): void {
    if (this.enabled) void this.latestVersion();
  }

  /**
   * `selfUpdateAllowed` is decided per request by the server: password auth,
   * or a direct request from this machine that did not pass through a proxy.
   */
  async info(selfUpdateAllowed: boolean): Promise<AppInfoResult> {
    const version = this.options?.version ?? null;

    if (!this.enabled || !version) {
      return {
        version,
        latestVersion: null,
        updateAvailable: false,
        update: { mode: "disabled" }
      };
    }

    const [latestVersion, installKind] = await Promise.all([
      this.latestVersion(),
      this.resolveInstallKind()
    ]);
    const updateAvailable = latestVersion !== null && compareVersions(latestVersion, version) > 0;

    if (installKind === "global" && selfUpdateAllowed) {
      return { version, latestVersion, updateAvailable, update: { mode: "self" } };
    }

    return {
      version,
      latestVersion,
      updateAvailable,
      update: {
        mode: "manual",
        command: installKind === "npx" ? NPX_COMMAND : GLOBAL_INSTALL_COMMAND
      }
    };
  }

  /** Installs the advertised latest version. Resolves with that version; never restarts. */
  async update(selfUpdateAllowed: boolean): Promise<string> {
    this.updateInFlight ??= this.installLatest(selfUpdateAllowed).finally(() => {
      this.updateInFlight = null;
    });
    return this.updateInFlight;
  }

  restart(): void {
    this.options?.restart?.();
  }

  private async installLatest(selfUpdateAllowed: boolean): Promise<string> {
    const info = await this.info(selfUpdateAllowed);

    if (info.update.mode !== "self" || !info.updateAvailable || !info.latestVersion) {
      throw new AppUpdateError(
        "update_unavailable",
        "This Rumi installation cannot update itself.",
        info.update.command
      );
    }

    try {
      await (this.options?.installVersion ?? installGlobalVersion)(info.latestVersion);
    } catch (error) {
      const detail = error instanceof Error ? error.message.trim() : String(error);
      throw new AppUpdateError(
        "update_failed",
        `npm could not install ${RUMI_PACKAGE_NAME}@${info.latestVersion}: ${lastLines(detail)}`
      );
    }

    return info.latestVersion;
  }

  private async latestVersion(): Promise<string | null> {
    const cached = this.latest;
    const ttl = cached?.version ? LATEST_VERSION_TTL_MS : FAILED_CHECK_TTL_MS;
    if (cached && Date.now() - cached.checkedAt < ttl) return cached.version;

    this.latestRequest ??= (this.options?.fetchLatestVersion ?? fetchRegistryLatestVersion)()
      .catch(() => null)
      .then((version) => {
        this.latest = { version, checkedAt: Date.now() };
        return version;
      })
      .finally(() => {
        this.latestRequest = null;
      });
    return this.latestRequest;
  }

  private resolveInstallKind(): Promise<"global" | "npx" | "other"> {
    this.installKind ??= (async () => {
      const entryPath = this.options?.entryPath ?? process.argv[1];
      if (!entryPath) return "other";
      const entry = await fs.realpath(entryPath).catch(() => path.resolve(entryPath));
      if (entry.split(path.sep).includes("_npx")) return "npx";

      const globalRoot = await (this.options?.globalPackageRoot ?? npmGlobalRoot)().catch(() => null);
      if (!globalRoot) return "other";
      const packageRoot = path.join(
        await fs.realpath(globalRoot).catch(() => globalRoot),
        ...RUMI_PACKAGE_NAME.split("/")
      );
      return entry.startsWith(packageRoot + path.sep) ? "global" : "other";
    })();
    return this.installKind;
  }
}

/** Compares numeric `major.minor.patch` versions. Prerelease versions never count as newer. */
export function compareVersions(left: string, right: string): number {
  const parse = (value: string) => {
    const match = value.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(-.+)?$/u);
    return match
      ? { parts: [Number(match[1]), Number(match[2]), Number(match[3])], prerelease: Boolean(match[4]) }
      : null;
  };
  const a = parse(left);
  const b = parse(right);
  if (!a || !b) return 0;

  for (let index = 0; index < 3; index += 1) {
    const difference = a.parts[index]! - b.parts[index]!;
    if (difference !== 0) return a.prerelease && difference > 0 ? 0 : Math.sign(difference);
  }

  return 0;
}

async function fetchRegistryLatestVersion(): Promise<string | null> {
  const response = await fetch(REGISTRY_LATEST_URL, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS)
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { version?: unknown };
  return typeof body.version === "string" ? body.version : null;
}

function npmGlobalRoot(): Promise<string | null> {
  return runNpm(["root", "--global"], 15_000).then((output) => output.trim() || null);
}

async function installGlobalVersion(version: string): Promise<void> {
  await runNpm(["install", "--global", `${RUMI_PACKAGE_NAME}@${version}`], NPM_TIMEOUT_MS);
}

// Prefer the npm that ships beside the running Node so service managers with a
// minimal PATH still find it.
async function npmExecutable(): Promise<string> {
  const bundled = path.join(path.dirname(process.execPath), "npm");
  return (await fs.access(bundled).then(() => true, () => false)) ? bundled : "npm";
}

async function runNpm(args: string[], timeout: number): Promise<string> {
  const executable = await npmExecutable();
  return new Promise((resolve, reject) => {
    execFile(executable, args, { timeout, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(String(stderr || error.message)));
        return;
      }
      resolve(String(stdout));
    });
  });
}

function lastLines(text: string, count = 6): string {
  return text.split(/\r?\n/u).filter(Boolean).slice(-count).join("\n");
}
