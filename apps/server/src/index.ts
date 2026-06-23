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

const started = await startRumiServer({
  workspacePath,
  host,
  port,
  logLevel,
  prettyLogs
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
