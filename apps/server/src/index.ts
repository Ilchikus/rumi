import type { RumiLogLevel } from "./server";
import { startRumiServer } from "./server";

const workspacePath = process.argv[2] ?? process.cwd();
const portArgIndex = process.argv.indexOf("--port");
const port =
  portArgIndex >= 0 && process.argv[portArgIndex + 1] ? Number(process.argv[portArgIndex + 1]) : 3000;
const hostArgIndex = process.argv.indexOf("--host");
const host = hostArgIndex >= 0 ? (process.argv[hostArgIndex + 1] ?? "127.0.0.1") : "127.0.0.1";
const logLevelArgIndex = process.argv.indexOf("--log-level");
const explicitLogLevel =
  logLevelArgIndex >= 0 && process.argv[logLevelArgIndex + 1] ? process.argv[logLevelArgIndex + 1] : null;
const logLevel = resolveLogLevel({
  verbose: process.argv.includes("--verbose"),
  ...(explicitLogLevel ? { explicit: explicitLogLevel } : {})
});
const prettyLogs = !process.argv.includes("--json-logs");
const authMode = resolveAuthMode(optionValue("--auth") ?? "none");
const authStatePath = optionValue("--auth-state");
const webRoot = optionValue("--web-root");

const started = await startRumiServer({
  workspacePath,
  host,
  port,
  logLevel,
  prettyLogs,
  ...(process.argv.includes("--api-only")
    ? { webRoot: false }
    : webRoot
      ? { webRoot }
      : {}),
  auth:
    authMode === "password"
      ? {
          mode: "password",
          ...(authStatePath ? { statePath: authStatePath } : {}),
          ...(process.argv.includes("--secure-cookies") ? { secureCookies: true } : {})
        }
      : { mode: "none" }
});

console.log(`Rumi server listening at ${started.url}`);

function resolveLogLevel(options: { verbose: boolean; explicit?: string }): RumiLogLevel {
  const value = options.explicit ?? (options.verbose ? "info" : "warn");
  const allowed: RumiLogLevel[] = ["silent", "fatal", "error", "warn", "info", "debug", "trace"];

  if (!allowed.includes(value as RumiLogLevel)) {
    throw new Error(`Invalid log level: ${value}`);
  }

  return value as RumiLogLevel;
}

function optionValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function resolveAuthMode(value: string): "none" | "password" {
  if (value !== "none" && value !== "password") {
    throw new Error(`Invalid auth mode: ${value}`);
  }

  return value;
}
