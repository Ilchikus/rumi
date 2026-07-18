#!/usr/bin/env node
import { Command } from "commander";
import type { WorkspaceNode } from "@rumi/contracts";
import { setLocalPassword, startRumiServer } from "@rumi/server";
import { WorkspaceRuntime } from "@rumi/runtime";

const program = new Command();

program.name("rumi").description("Rumi workspace server CLI").version("0.0.0");

program
  .command("auth")
  .description("Manage instance authentication")
  .command("set-password")
  .description("Set or reset the server-local login and invalidate existing sessions")
  .argument("<workspace>", "Workspace directory")
  .requiredOption("--username <username>", "Login username")
  .option("--auth-state <path>", "Override the authentication state file")
  .option("--password-stdin", "Read the new password from standard input")
  .action(
    async (
      workspace: string,
      options: { username: string; authState?: string; passwordStdin?: boolean }
    ) => {
      const password = options.passwordStdin
        ? await readPasswordFromStdin()
        : await promptForNewPassword();
      const result = await setLocalPassword({
        workspacePath: workspace,
        username: options.username,
        password,
        ...(options.authState ? { statePath: options.authState } : {})
      });

      console.log(`Password login configured for ${options.username}`);
      console.log(`Auth state: ${result.statePath}`);
      console.log("Existing sessions were invalidated.");
    }
  );

program
  .command("status")
  .argument("<workspace>", "Workspace directory")
  .option("--json", "Print JSON")
  .action(async (workspace: string, options: { json?: boolean }) => {
    const runtime = await WorkspaceRuntime.open({ rootPath: workspace });
    const info = runtime.info();

    if (options.json) {
      console.log(JSON.stringify(info, null, 2));
      return;
    }

    console.log(`Workspace: ${info.name}`);
    console.log(`Root: ${info.rootPath}`);
  });

program
  .command("tree")
  .argument("<workspace>", "Workspace directory")
  .option("--json", "Print JSON")
  .action(async (workspace: string, options: { json?: boolean }) => {
    const runtime = await WorkspaceRuntime.open({ rootPath: workspace });
    const tree = await runtime.getTree();

    if (options.json) {
      console.log(JSON.stringify(tree, null, 2));
      return;
    }

    printTree(tree);
  });

program
  .command("page")
  .argument("<workspace>", "Workspace directory")
  .argument("<path>", "Workspace-relative page path")
  .option("--json", "Print JSON")
  .action(async (workspace: string, pagePath: string, options: { json?: boolean }) => {
    const runtime = await WorkspaceRuntime.open({ rootPath: workspace });
    const page = await runtime.openPage(pagePath);

    if (options.json) {
      console.log(JSON.stringify(page, null, 2));
      return;
    }

    console.log(page.markdownBody);
  });

program
  .command("index")
  .argument("<workspace>", "Workspace directory")
  .option("--json", "Print JSON")
  .action(async (workspace: string, options: { json?: boolean }) => {
    const runtime = await WorkspaceRuntime.open({ rootPath: workspace });
    const result = await runtime.rebuildIndex();

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(`Index status: ${result.status}`);
    console.log(`Indexed at: ${result.indexedAt}`);
    console.log(`Documents: ${result.documentCount}`);
  });

program
  .command("search")
  .argument("<workspace>", "Workspace directory")
  .argument("<query>", "Search query")
  .option("--limit <limit>", "Maximum results", "50")
  .option("--json", "Print JSON")
  .action(async (workspace: string, query: string, options: { limit: string; json?: boolean }) => {
    const runtime = await WorkspaceRuntime.open({ rootPath: workspace });
    const result = await runtime.searchWorkspace({ query, limit: Number(options.limit) });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    for (const item of result.items) {
      console.log(`${item.title} (${item.kind})\t${item.path}`);
    }
  });

program
  .command("snapshot")
  .argument("<workspace>", "Workspace directory")
  .argument("<path>", "Workspace-relative page path")
  .option("--json", "Print JSON")
  .action(async (workspace: string, pagePath: string, options: { json?: boolean }) => {
    const runtime = await WorkspaceRuntime.open({ rootPath: workspace });
    const revision = await runtime.checkpointNow({ path: pagePath, reason: "manual-checkpoint" });

    if (options.json) {
      console.log(JSON.stringify(revision, null, 2));
      return;
    }

    console.log(`Snapshot: ${revision.revisionId}`);
    console.log(`Path: ${revision.contentPath}`);
    console.log(`Hash: ${revision.contentHash}`);
  });

program
  .command("history")
  .argument("<workspace>", "Workspace directory")
  .argument("<path>", "Workspace-relative page path")
  .option("--json", "Print JSON")
  .action(async (workspace: string, pagePath: string, options: { json?: boolean }) => {
    const runtime = await WorkspaceRuntime.open({ rootPath: workspace });
    const revisions = await runtime.listRevisions(pagePath);

    if (options.json) {
      console.log(JSON.stringify(revisions, null, 2));
      return;
    }

    for (const revision of revisions) {
      console.log(`${revision.createdAt}\t${revision.reason}\t${revision.revisionId}`);
    }
  });

const databaseCommand = program.command("database").description("Manage folder-backed databases");

databaseCommand
  .command("create")
  .argument("<workspace>", "Workspace directory")
  .argument("<name>", "Database name")
  .option("--parent <path>", "Parent workspace path", "")
  .option("--json", "Print JSON")
  .action(async (workspace: string, name: string, options: { parent: string; json?: boolean }) => {
    const runtime = await WorkspaceRuntime.open({ rootPath: workspace });
    const result = await runtime.createDatabase({ parentPath: options.parent, name });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(`Database created: ${result.path}`);
  });

databaseCommand
  .command("query")
  .argument("<workspace>", "Workspace directory")
  .argument("<database>", "Database workspace path")
  .option("--json", "Print JSON")
  .action(async (workspace: string, databasePath: string, options: { json?: boolean }) => {
    const runtime = await WorkspaceRuntime.open({ rootPath: workspace });
    const result = await runtime.queryDatabase({ databasePath });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    for (const record of result.records) {
      console.log(`${record.title}\t${record.path}`);
    }
  });

program
  .command("reconcile")
  .argument("<workspace>", "Workspace directory")
  .option("--json", "Print JSON")
  .action(async (workspace: string, options: { json?: boolean }) => {
    const runtime = await WorkspaceRuntime.open({ rootPath: workspace });
    const result = await runtime.reconcileWorkspace();

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(`Reconcile status: ${result.status}`);
    console.log(`Reconciled at: ${result.reconciledAt}`);
    console.log(`Events: ${result.events.length}`);
  });

program
  .command("serve")
  .argument("<workspace>", "Workspace directory")
  .option("--host <host>", "Host to bind", "127.0.0.1")
  .option("--port <port>", "Port to bind", "3000")
  .option("--verbose", "Print key workspace/API events")
  .option("--log-level <level>", "Set server log level")
  .option("--json-logs", "Print structured JSON logs instead of pretty logs")
  .option("--auth <mode>", "Authentication mode: none or password", "none")
  .option("--auth-state <path>", "Override the authentication state file")
  .option("--secure-cookies", "Always mark the session cookie Secure")
  .option("--web-root <path>", "Serve a built Rumi web client from this directory")
  .option("--api-only", "Run without serving the official web client")
  .action(async (workspace: string, options: {
    host: string;
    port: string;
    verbose?: boolean;
    logLevel?: string;
    jsonLogs?: boolean;
    auth: string;
    authState?: string;
    secureCookies?: boolean;
    webRoot?: string;
    apiOnly?: boolean;
  }) => {
    const authMode = resolveAuthMode(options.auth);
    const started = await startRumiServer({
      workspacePath: workspace,
      host: options.host,
      port: Number(options.port),
      logLevel: resolveLogLevel(options.logLevel, options.verbose ?? false),
      prettyLogs: !options.jsonLogs,
      ...(options.apiOnly
        ? { webRoot: false }
        : options.webRoot
          ? { webRoot: options.webRoot }
          : {}),
      auth:
        authMode === "password"
          ? {
              mode: "password",
              ...(options.authState ? { statePath: options.authState } : {}),
              ...(options.secureCookies ? { secureCookies: true } : {})
            }
          : { mode: "none" }
    });

    console.log(`Rumi server listening at ${started.url}`);
    installShutdownHandlers(started.server);
  });

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

function printTree(node: WorkspaceNode, depth = 0): void {
  console.log(`${"  ".repeat(depth)}${node.name} (${node.kind})`);

  for (const child of node.children ?? []) {
    printTree(child, depth + 1);
  }
}

function resolveLogLevel(value: string | undefined, verbose: boolean): "silent" | "fatal" | "error" | "warn" | "info" | "debug" | "trace" {
  const level = value ?? (verbose ? "info" : "warn");
  const allowed = ["silent", "fatal", "error", "warn", "info", "debug", "trace"] as const;

  if (!allowed.includes(level as (typeof allowed)[number])) {
    throw new Error(`Invalid log level: ${level}`);
  }

  return level as (typeof allowed)[number];
}

function resolveAuthMode(value: string): "none" | "password" {
  if (value !== "none" && value !== "password") {
    throw new Error(`Invalid auth mode: ${value}`);
  }

  return value;
}

async function readPasswordFromStdin(): Promise<string> {
  let input = "";

  for await (const chunk of process.stdin) {
    input += chunk.toString();
  }

  return input.replace(/\r?\n$/, "");
}

async function promptForNewPassword(): Promise<string> {
  const password = await readHiddenLine("New password: ");
  const confirmation = await readHiddenLine("Confirm password: ");

  if (password !== confirmation) {
    throw new Error("Passwords do not match");
  }

  return password;
}

function readHiddenLine(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Interactive password input requires a TTY; use --password-stdin instead");
  }

  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const wasRaw = input.isRaw ?? false;
    let value = "";

    const finish = (error?: Error) => {
      input.off("data", handleData);
      input.setRawMode(wasRaw);
      input.pause();
      process.stdout.write("\n");

      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    };

    const handleData = (chunk: Buffer) => {
      const text = chunk.toString("utf8");

      for (const character of text) {
        if (character === "\u0003") {
          finish(new Error("Password input cancelled"));
          return;
        }

        if (character === "\r" || character === "\n") {
          finish();
          return;
        }

        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          continue;
        }

        if (!/[\u0000-\u001f\u007f]/.test(character)) {
          value += character;
        }
      }
    };

    process.stdout.write(label);
    input.setRawMode(true);
    input.resume();
    input.on("data", handleData);
  });
}

function installShutdownHandlers(server: { close: () => Promise<void> }): void {
  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.log(`Rumi server received ${signal}; closing cleanly.`);
    void server.close().catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
